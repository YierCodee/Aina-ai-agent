"""ORM matkul: katalog → offering → enrollment, plus dosen, tutor, dan materi.

Tiga lapis sengaja dipisah karena tiga alasan berbeda:
- `courses`          identitas matkul yang stabil (kode, judul, SKS, jenis).
- `course_offerings` matkul itu *dibuka* pada satu semester, di kelas tertentu,
                     dengan dosen tertentu. Badge "Semester berjalan" butuh ini.
- `enrollments`      progres **mahasiswa** terhadap offering tersebut. Progress
                     bukan properti matkul, jadi tidak boleh menempel ke katalog.

Tidak ada `relationship()` di file ini. Semua query memakai join eksplisit di
service (`course_service._fetch_course_rows`). Alasannya: SQLAlchemy async melempar
error kalau ada lazy load yang terlambat, dan query daftar matkul perlu join 9
tabel sekaligus — relationship hanya menambah lapisan yang bisa meledak saat
runtime, bukan saat review.

Konsekuensi yang harus diingat: unit of work TIDAK mengurutkan flush berdasarkan
kolom FK, hanya berdasarkan relationship. Makanya seed harus melakukan
`flush()` eksplisit per level dependensi (lihat `seed/courses_seed.py`).

Hapus/tambah kolom lewat Alembic (`backend/migrations/`), bukan `create_all`.
"""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

# Nilai enum juga dipakai Pydantic (schemas/courses.py) dan tipe frontend
# (src/data/courses.ts). Kalau satu nilai berubah, ketiga tempat ikut berubah.

# Partial index: hanya baris aktif yang ikut unik, jadi boleh ada banyak term
# tidak-aktif dan `is_active = TRUE` tetap dijamin tunggal.
_ONLY_ACTIVE = text("is_active = 1")


class Term(Base):
    """Semester. Partial unique index di bawah menjamin hanya ada satu yang aktif."""

    __tablename__ = "terms"
    __table_args__ = (
        CheckConstraint("semester_no IN (1, 2)", name="ck_terms_semester"),
        CheckConstraint("is_active IN (0, 1)", name="ck_terms_active"),
        Index("ux_terms_active", "is_active", unique=True, sqlite_where=_ONLY_ACTIVE),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    academic_year: Mapped[str] = mapped_column(String(16))
    semester_no: Mapped[int] = mapped_column(Integer)
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class Course(Base):
    """Katalog matkul. Satu baris per kode, lintas semester."""

    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("code", name="uq_courses_code"),
        CheckConstraint("kind IN ('teori', 'praktikum')", name="ck_courses_kind"),
        CheckConstraint("sks BETWEEN 0 AND 12", name="ck_courses_sks"),
        CheckConstraint("is_active IN (0, 1)", name="ck_courses_active"),
        Index("ix_courses_kind", "kind", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))
    sks: Mapped[int] = mapped_column(Integer)
    focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    curriculum: Mapped[str] = mapped_column(String(64), default="Teknik Informatika")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class Lecturer(Base):
    """Dosen / asisten lab.

    `avatar_tone` menyimpan token desain (`secondary`), bukan class CSS mentah
    (`bg-secondary`). Class CSS milik `src/index.css`; kalau disimpan di sini,
    setiap ganti tema di frontend jadi butuh migrasi data.
    `initial` tidak disimpan — diturunkan dari `name` di service.
    """

    __tablename__ = "lecturers"
    __table_args__ = (
        CheckConstraint(
            "avatar_tone IN ('secondary', 'success-emerald', 'tertiary-container', "
            "'primary-container', 'surface-tint', 'surface-dark')",
            name="ck_lecturers_tone",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    nidn: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    avatar_tone: Mapped[str] = mapped_column(String(32), default="secondary")


class CourseOffering(Base):
    """Penawaran matkul: satu course dibuka di satu term, di satu kelas."""

    __tablename__ = "course_offerings"
    __table_args__ = (
        UniqueConstraint("course_id", "term_id", "class_label", name="uq_offering"),
        CheckConstraint(
            "status IN ('draft', 'aktif', 'selesai')", name="ck_offering_status"
        ),
        Index("ix_offerings_term", "term_id", "status"),
        Index("ix_offerings_course", "course_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    term_id: Mapped[str] = mapped_column(
        ForeignKey("terms.id", ondelete="CASCADE"), index=True
    )
    class_label: Mapped[str] = mapped_column(String(64))
    room: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="aktif")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class OfferingLecturer(Base):
    """Penugasan dosen ke offering. M:N — satu dosen bisa di beberapa offering."""

    __tablename__ = "offering_lecturers"
    __table_args__ = (
        CheckConstraint("role IN ('utama', 'asisten', 'lab')", name="ck_ol_role"),
        CheckConstraint("is_primary IN (0, 1)", name="ck_ol_primary"),
        Index("ix_ol_lecturer", "lecturer_id"),
    )

    offering_id: Mapped[str] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), primary_key=True
    )
    lecturer_id: Mapped[str] = mapped_column(
        ForeignKey("lecturers.id", ondelete="RESTRICT"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16), default="utama")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)


class ConsultationSlot(Base):
    """Slot konsultasi mingguan. Sumber dari string "Sel & Kam 13:00 - 15:00".

    Disimpan per baris per hari supaya bisa dipakai query jadwal, bukan cuma
    ditampilkan sebagai teks.
    """

    __tablename__ = "consultation_slots"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 1 AND 7", name="ck_slot_day"),
        CheckConstraint("ends_at > starts_at", name="ck_slot_time"),
        Index("ix_slot_lecturer", "lecturer_id", "day_of_week"),
        Index("ix_slot_offering", "offering_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecturer_id: Mapped[str] = mapped_column(
        ForeignKey("lecturers.id", ondelete="CASCADE"), index=True
    )
    offering_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer)
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)
    room: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(16), nullable=True)


class Enrollment(Base):
    """Progres mahasiswa terhadap satu offering. Sumber tunggal `progress_percent`.

    `user_id` sengaja `String` polos tanpa tabel `users`, konsisten dengan
    `chat_sessions.user_id` yang sudah ada (backend/models/chat.py).
    """

    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("user_id", "offering_id", name="uq_enrollment"),
        CheckConstraint(
            "progress_percent BETWEEN 0 AND 100", name="ck_enr_progress"
        ),
        CheckConstraint("current_week >= 1", name="ck_enr_week"),
        CheckConstraint("featured IN (0, 1)", name="ck_enr_featured"),
        CheckConstraint(
            "status IN ('aktif', 'selesai', 'dropped')", name="ck_enr_status"
        ),
        Index("ix_enr_user_status", "user_id", "status"),
        Index("ix_enr_offering", "offering_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), default="mahasiswa")
    offering_id: Mapped[str] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True
    )
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    current_week: Mapped[int] = mapped_column(Integer, default=1)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="aktif")
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    last_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )


class CourseWeek(Base):
    """Rencana mingguan. Sumber `weekLabel` = "Minggu 8: Teori Graf & Pohon"."""

    __tablename__ = "course_weeks"
    __table_args__ = (
        UniqueConstraint("offering_id", "week_no", name="uq_week"),
        CheckConstraint("week_no BETWEEN 1 AND 20", name="ck_week_no"),
        CheckConstraint(
            "meeting_kind IN ('teori', 'praktikum', 'uts', 'uas', 'review')",
            name="ck_week_kind",
        ),
        Index("ix_weeks_offering", "offering_id", "week_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    offering_id: Mapped[str] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True
    )
    week_no: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    meeting_kind: Mapped[str] = mapped_column(String(16), default="teori")
    planned_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )


class AiTutor(Base):
    """Persona tutor AI. Bisa dipakai lebih dari satu matkul.

    `avatar_tone` dipakai untuk avatar di FilesPage. Sama seperti
    `Lecturer.avatar_tone`: token desain, bukan class CSS.
    """

    __tablename__ = "ai_tutors"
    __table_args__ = (
        UniqueConstraint("name", name="uq_tutors_name"),
        CheckConstraint(
            "status IN ('running', 'paused', 'error')", name="ck_tutors_status"
        ),
        CheckConstraint(
            "avatar_tone IN ('secondary', 'success-emerald', 'tertiary-container', "
            "'primary-container', 'surface-tint', 'surface-dark')",
            name="ck_tutors_tone",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text)
    emoji: Mapped[str] = mapped_column(String(16), default="\U0001f916")
    avatar_tone: Mapped[str] = mapped_column(String(32), default="secondary")
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="running")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class CourseTutor(Base):
    """Tutor untuk satu offering, dengan sandbox RAG sendiri.

    `rag_namespace` UNIQUE per baris. Inilah yang membuat klaim "Isolasi Konteks
    RAG" bisa ditegakkan di query retrieval: dua offering tidak mungkin berbagi
    namespace, jadi tidak mungkin saling bocor konteks.
    """

    __tablename__ = "course_tutors"
    __table_args__ = (
        UniqueConstraint("rag_namespace", name="ux_tutor_namespace"),
        CheckConstraint("is_primary IN (0, 1)", name="ck_ct_primary"),
        Index("ix_ct_tutor", "tutor_id"),
    )

    offering_id: Mapped[str] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), primary_key=True
    )
    tutor_id: Mapped[str] = mapped_column(
        ForeignKey("ai_tutors.id", ondelete="RESTRICT"), primary_key=True
    )
    rag_namespace: Mapped[str] = mapped_column(String(128))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.3)


class CourseMaterial(Base):
    """Materi & status indeksasi RAG.

    Dipakai bersama: `/api/courses` menjumlahkannya untuk `ragFiles`/`ragChunks`,
    dan `/api/materials` menyajikannya sebagai daftar file di FilesPage. Satu
    tabel untuk dua halaman, supaya angka materi yang terlihat di kartu matkul
    dan daftar file di FilesPage tidak mungkin berbeda.
    `offering_id` NULL berarti materi global (mis. hasil sync LMS), bukan milik
    satu matkul.

    Kolom `tutor_id` menggantikan object `assistant` yang dulu ada di data mock
    frontend; `initial` dan warna avatar diturunkan di service.
    """

    __tablename__ = "course_materials"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('pdf', 'docx', 'csv', 'xlsx', 'txt', 'md', 'link')",
            name="ck_mat_kind",
        ),
        # 'queued' menggantikan 'synced' dan 'indexed' tetap terpisah karena
        # FilesTable merender dua badge berbeda untuk keduanya.
        CheckConstraint(
            "status IN ('queued', 'indexing', 'ready', 'indexed', 'error')",
            name="ck_mat_status",
        ),
        CheckConstraint(
            "index_progress BETWEEN 0 AND 100", name="ck_mat_progress"
        ),
        CheckConstraint("chunk_count >= 0", name="ck_mat_chunks"),
        CheckConstraint(
            "access_level IN ('student', 'lab', 'public')", name="ck_mat_access"
        ),
        Index("ix_mat_offering", "offering_id", "status"),
        Index("ix_mat_folder", "folder_id"),
        Index("ix_mat_status", "status"),
        Index("ix_mat_tutor", "tutor_id"),
        Index("ix_mat_name", "name"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    offering_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=True
    )
    # Folder virtual (lihat MaterialFolder). NULL = file lepas, tetap tampil di
    # daftar utama. Dipakai supaya angka "5 files / 65 MB" di PinnedFolders
    # dihitung dengan COUNT/SUM di service, bukan ditulis tangan.
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("material_folders.id", ondelete="SET NULL"), nullable=True
    )
    tutor_id: Mapped[str | None] = mapped_column(
        ForeignKey("ai_tutors.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))
    source_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    derived_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_mb: Mapped[float] = mapped_column(Float, default=0.0)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    index_progress: Mapped[int] = mapped_column(Integer, default=0)
    access_level: Mapped[str] = mapped_column(String(16), default="student")
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class MaterialChunk(Base):
    """Satu potongan teks hasil ingest RAG, milik satu materi & satu offering.

    Inilah yang membuat `ragChunks` (SUM `course_materials.chunk_count`) jadi
    angka riil: satu baris di sini = satu chunk yang benar-benar diparse dari
    byte file di `storage_path`, bukan hasil bagi artifisial `_chunk_split()`.

    `embedding` menyimpan vektor Gemini sebagai JSON array (TEXT) supaya tetap
    jalan di SQLite polos. Kalau paket `sqlite-vec` terpasang, retrieval bisa
    memakai index vec0; kalau tidak, fallback cosine brute-force di Python
    (`services/ingest_service.py`) membaca kolom ini. Isolasi konteks
    ditegakkan lewat `offering_id`: query retrieval selalu memfilter kolom
    ini, jadi chunks matkul A tidak pernah terambil tutor matkul B.
    """

    __tablename__ = "material_chunks"
    __table_args__ = (
        CheckConstraint("chunk_index >= 0", name="ck_chunk_index"),
        CheckConstraint("token_count >= 0", name="ck_chunk_tokens"),
        Index("ix_chunk_material", "material_id", "chunk_index"),
        Index("ix_chunk_offering", "offering_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    material_id: Mapped[str] = mapped_column(
        ForeignKey("course_materials.id", ondelete="CASCADE"), index=True
    )
    offering_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class MaterialFolder(Base):
    """Folder virtual untuk FilesPage.

    Bukan entitas filesystem dan tidak punya path di disk — hanya pengelompokan
    tampilan. Jumlah dan ukuran dihitung dari `course_materials`.
    """

    __tablename__ = "material_folders"
    __table_args__ = (
        CheckConstraint(
            "icon IN ('folder', 'shared', 'code', 'lock')", name="ck_folder_icon"
        ),
        CheckConstraint(
            "badge_tone IN ('rag', 'shared', 'vector', 'confidential')",
            name="ck_folder_badge",
        ),
        Index("ix_folder_sort", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    badge_label: Mapped[str] = mapped_column(String(64))
    badge_tone: Mapped[str] = mapped_column(String(16))
    icon: Mapped[str] = mapped_column(String(16), default="folder")
    offering_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)