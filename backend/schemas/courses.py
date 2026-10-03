"""Skema request/response untuk endpoint matkul & materi.

Dua kelompok DTO di sini, dan bedanya penting:

1. **DTO tampilan** (`CourseOut`, `MaterialOut`) bentuknya sengaja meniru
   types frontend supaya komponen tidak perlu diubah:
   - `CourseOut`      -> `CourseItem` di src/data/courses.ts
   - `MaterialOut`    -> `FileDoc`     di src/data/files.ts
   Field yang camelCase di TypeScript memakai `alias=` Pydantic, bukan nama
   field Python, supaya sisi server tetap snake_case. `alias=` (bukan
   `serialization_alias`) dipakai karena perlu berlaku dua arah: FastAPI
   menyerialikan dengan alias, dan request body dari frontend juga mengirim
   nama camelCase. `populate_by_name=True` tetap menyisakan akses snake_case
   dari kode Python. Test di backend/tests/test_courses.py mengunci nama key
   JSON-nya — kalau alias ini berubah diam-diam, komponen frontend dapat
   `undefined` tanpa error kompilasi.

2. **DTO domain** (`TermOut`, `WeekOut`, `SlotOut`) bentuknya mengikuti tabel,
   dipakai untuk detail yang tidak dirender sebagai kartu ringkas.

Yang TIDAK ada di sini: warna avatar sebagai class CSS. Yang dikirim adalah
token semantik (`tone`), dipetakan ke class Tailwind di frontend. Kalau class
CSS ikut lewat JSON, setiap perubahan tema di `index.css` butuh migrasi data.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CourseKind = Literal["teori", "praktikum"]
CourseSort = Literal["name", "progress", "sks"]
CoursesTab = Literal["all", "teori", "praktikum"]
QuickView = Literal["all", "teori", "praktikum", "progress"]
AvatarTone = Literal[
    "secondary",
    "success-emerald",
    "tertiary-container",
    "primary-container",
    "surface-tint",
    "surface-dark",
]
MaterialKind = Literal["pdf", "docx", "csv", "xlsx", "txt", "md", "link"]
MaterialStatus = Literal["queued", "indexing", "ready", "indexed", "error"]
AccessLevel = Literal["student", "lab", "public"]
WeekKind = Literal["teori", "praktikum", "uts", "uas", "review"]


# --------------------------------------------------------------------------
# DTO tampilan
# --------------------------------------------------------------------------
class LecturerCard(BaseModel):
    """Bentuk yang consumed `CourseCard.tsx`. `initial` & `tone` diturunkan."""

    model_config = ConfigDict(populate_by_name=True)

    name: str
    initial: str
    tone: AvatarTone
    consult: str = ""
    email: str | None = None


class TutorCard(BaseModel):
    """Bentuk yang consumed `CourseCard.tsx`. `desc` bukan `description`."""

    model_config = ConfigDict(populate_by_name=True)

    name: str
    desc: str
    emoji: str


class CourseCardOut(BaseModel):
    """Satu kartu matkul. Menggantikan `CourseItem` di src/data/courses.ts."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    code: str
    title: str
    sks: int
    kelas: str
    kind: CourseKind
    focus: str = ""
    week_label: str = Field(alias="weekLabel", default="")
    progress: int = 0
    rag_files: int = Field(alias="ragFiles", default=0)
    rag_chunks: int = Field(alias="ragChunks", default=0)
    lecturer: LecturerCard
    tutor: TutorCard | None = None
    featured: bool = False


class CourseCounts(BaseModel):
    """Jumlah per quick view. Menggantikan `Record<CourseQuickViewId, number>`."""

    model_config = ConfigDict(populate_by_name=True)

    all: int = 0
    teori: int = 0
    praktikum: int = 0
    progress: int = 0


class CourseMetrics(BaseModel):
    """Empat metric card di CoursesMetrics.tsx + angka sidebar."""

    model_config = ConfigDict(populate_by_name=True)

    total_courses: int = Field(alias="totalCourses", default=0)
    total_sks: int = Field(alias="totalSks", default=0)
    total_files: int = Field(alias="totalFiles", default=0)
    avg_progress: int = Field(alias="avgProgress", default=0)
    dedicated_tutors: int = Field(alias="dedicatedTutors", default=0)
    # Persen offering yang punya sandbox RAG sendiri. Tiap baris 0-100.
    rag_isolation: int = Field(alias="ragIsolation", default=0)


class CourseListOut(BaseModel):
    """Satu round-trip untuk seluruh halaman Courses."""

    model_config = ConfigDict(populate_by_name=True)

    total: int = 0
    items: list[CourseCardOut] = Field(default_factory=list)
    counts: CourseCounts = Field(default_factory=CourseCounts)
    metrics: CourseMetrics = Field(default_factory=CourseMetrics)
    term_label: str = Field(alias="termLabel", default="")


# --------------------------------------------------------------------------
# DTO domain
# --------------------------------------------------------------------------
class TermOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    label: str
    academic_year: str = Field(alias="academicYear")
    semester_no: int = Field(alias="semesterNo")
    starts_on: date | None = None
    ends_on: date | None = None
    is_active: bool = Field(alias="isActive", default=False)


class TermCreateIn(BaseModel):
    """Buat semester baru. `activate` default True supaya alur "belum ada
    semester aktif" (error 409 saat enroll) langsung selesai dalam satu langkah."""

    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(min_length=1, max_length=64)
    academic_year: str = Field(
        alias="academicYear", min_length=9, max_length=16, pattern=r"^\d{4}/\d{4}$"
    )
    semester_no: Literal[1, 2] = Field(alias="semesterNo")
    starts_on: date | None = Field(alias="startsOn", default=None)
    ends_on: date | None = Field(alias="endsOn", default=None)
    activate: bool = True


class TermListOut(BaseModel):
    """Daftar semester + id yang sedang aktif (null kalau belum ada)."""

    model_config = ConfigDict(populate_by_name=True)

    items: list[TermOut] = Field(default_factory=list)
    active_id: str | None = Field(alias="activeId", default=None)


class WeekOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    week_no: int = Field(alias="weekNo")
    title: str
    meeting_kind: WeekKind = Field(alias="meetingKind", default="teori")
    planned_on: date | None = Field(alias="plannedOn", default=None)
    completed: bool = False


class SlotOut(BaseModel):
    """Satu baris jadwal konsultasi. Label gabungan dibentuk di service."""

    model_config = ConfigDict(populate_by_name=True)

    day_of_week: int = Field(alias="dayOfWeek")
    starts_at: time
    ends_at: time
    room: str | None = None
    location: str | None = None


class TutorDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str
    emoji: str
    status: str = "running"
    model: str | None = None
    rag_namespace: str = Field(alias="ragNamespace", default="")
    temperature: float = 0.3


class CourseDetailOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    course: CourseCardOut
    term: TermOut
    weeks: list[WeekOut] = Field(default_factory=list)
    consultation: list[SlotOut] = Field(default_factory=list)
    tutor: TutorDetail | None = None


# --------------------------------------------------------------------------
# Materi (dipakai bersama CoursesPage & FilesPage)
# --------------------------------------------------------------------------
class MaterialAssistant(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    initial: str
    name: str
    tone: AvatarTone = "secondary"


class MaterialOut(BaseModel):
    """Satu baris tabel file. Menggantikan `FileDoc` di src/data/files.ts."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    sub: str = ""
    kind: MaterialKind
    size_label: str = Field(alias="sizeLabel", default="")
    size_mb: float = Field(alias="sizeMB", default=0.0)
    modified: str = ""
    # Epoch detik dari updated_at, dipakai frontend untuk sort "Recent".
    modified_ts: float = Field(alias="modifiedTs", default=0.0)
    status: MaterialStatus = "queued"
    progress: int | None = None
    assistant: MaterialAssistant
    # Kunci baru:FK ke matkul. NULL = materi global.
    course_id: str | None = Field(alias="courseId", default=None)
    course_title: str | None = Field(alias="courseTitle", default=None)
    access_level: AccessLevel = Field(alias="accessLevel", default="student")


class MaterialStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total: int = 0
    indexed: int = 0
    indexing: int = 0
    total_chunks: int = Field(alias="totalChunks", default=0)
    total_size_mb: float = Field(alias="totalSizeMB", default=0.0)


class MaterialListOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total: int = 0
    items: list[MaterialOut] = Field(default_factory=list)
    stats: MaterialStats = Field(default_factory=MaterialStats)


class FolderBadge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    tone: Literal["rag", "shared", "vector", "confidential"]


class FolderOut(BaseModel):
    """Satu kartu folder di FilesPage.Angka dihitung dari course_materials."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    count: str = "0 files"
    size: str = "0 MB"
    updated: str = ""
    badge: FolderBadge
    icon: Literal["folder", "shared", "code", "lock"] = "folder"


class FolderListOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    folders: list[FolderOut] = Field(default_factory=list)


FolderIcon = Literal["folder", "shared", "code", "lock"]
FolderBadgeTone = Literal["rag", "shared", "vector", "confidential"]


class FolderCreateIn(BaseModel):
    """Buat folder virtual baru.

    `offering_id` null = folder global; terisi = milik satu offering (scope
    matkul). Nama unik per scope — dicek di service karena NULL tidak bisa
    ikut UNIQUE constraint (`NULL != NULL` di SQL).
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=128)
    icon: FolderIcon = "folder"
    badge_tone: FolderBadgeTone = Field(alias="badgeTone", default="rag")
    badge_label: str | None = Field(
        alias="badgeLabel", default=None, max_length=64
    )
    offering_id: str | None = Field(
        alias="offeringId", default=None, max_length=64
    )
    # Alternatif: Course.id, di-resolve ke offering semester aktif.
    course_id: str | None = Field(
        alias="courseId", default=None, max_length=64
    )


class FolderUpdateIn(BaseModel):
    """Rename / ganti ikon folder. Semua opsional; nama unik per scope."""

    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=128)
    icon: FolderIcon | None = None


class FolderDeleteOut(BaseModel):
    """Hasil hapus folder: folder hilang + N file jadi lepas."""

    model_config = ConfigDict(populate_by_name=True)

    deleted: int = 0
    released: int = 0


# --------------------------------------------------------------------------
# Input
# --------------------------------------------------------------------------
class MaterialIn(BaseModel):
    """Satu file hasil dropzone. Tidak Includes bytes — hanya metadata."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=255)
    kind: MaterialKind | None = None
    size_mb: float = Field(alias="sizeMB", default=0.0, ge=0)
    offering_id: str | None = Field(
        alias="offeringId", default=None
    )
    source_label: str | None = Field(
        alias="sourceLabel", default=None, max_length=64
    )
    access_level: AccessLevel = Field(
        alias="accessLevel", default="student"
    )


class MaterialBulkIn(BaseModel):
    files: list[MaterialIn] = Field(default_factory=list, max_length=50)


class MaterialProgressIn(BaseModel):
    """Dipakai simulasi pipeline indexing di FilesPage + pindah folder.

    `folder_id` memakai semantik "ada di JSON" (bukan "non-null"): dikirim
    string = masuk folder itu, dikirim `null` = keluarkan dari folder,
    tidak dikirim = folder tidak disentuh. Service membaca via
    `exclude_unset`, jadi ketiga kasus ini bisa dibedakan.
    """

    model_config = ConfigDict(populate_by_name=True)

    status: MaterialStatus | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    progress: int | None = Field(default=None, ge=0, le=100)
    chunk_count: int | None = Field(
        alias="chunkCount", default=None, ge=0
    )
    derived_note: str | None = Field(
        alias="sub", default=None, max_length=255
    )
    folder_id: str | None = Field(
        alias="folderId", default=None, max_length=64
    )


class WeekProgressIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    week_no: int | None = Field(alias="weekNo", default=None, ge=1, le=20)
    completed: bool | None = None


# ---------------------------------------------------------------------------
# Input CRUD matkul
# ---------------------------------------------------------------------------
class LecturerIn(BaseModel):
    """Dosen untuk satu offering.

    `id` diisi kalau dosen sudah ada di tabel (dipakai ulang), dikosongkan kalau
    baru. Service selalu mengembalikan id hasil resolve, jadi pemanggil tidak
    perlu tahu mana yang baru.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    email: str | None = Field(default=None, max_length=128)
    avatar_tone: AvatarTone = Field(alias="avatarTone", default="secondary")


class TutorIn(BaseModel):
    """Tutor AI. Sama seperti `LecturerIn`: `id` kosong berarti buat baru."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=2000)
    emoji: str = Field(default="\U0001f916", max_length=16)
    model: str | None = Field(default=None, max_length=128)


class WeekIn(BaseModel):
    """Satu minggu silabus."""

    model_config = ConfigDict(populate_by_name=True)

    week_no: int = Field(alias="weekNo", ge=1, le=20)
    title: str = Field(min_length=1, max_length=255)
    meeting_kind: WeekKind = Field(alias="meetingKind", default="teori")
    completed: bool = False


class CourseCreateIn(BaseModel):
    """Buat matkul + offering + enrollment dalam satu permintaan.

    Form di halaman Courses memuat semua ini, jadi satu submit = satu transaksi.
    `weeks` opsional: kalau dikirim kosong, `weekLabel` hanya menampilkan
    "Minggu N" tanpa topik — itu valid, bukan error.
    """

    model_config = ConfigDict(populate_by_name=True)

    code: str = Field(min_length=2, max_length=32)
    title: str = Field(min_length=2, max_length=255)
    kind: CourseKind
    sks: int = Field(ge=0, le=12)
    focus: str | None = Field(default=None, max_length=1000)
    curriculum: str = Field(default="Teknik Informatika", max_length=64)
    class_label: str = Field(alias="classLabel", min_length=1, max_length=64)
    room: str | None = Field(default=None, max_length=64)
    lecturer: LecturerIn
    tutor: TutorIn | None = None
    progress_percent: int = Field(alias="progressPercent", default=0, ge=0, le=100)
    current_week: int = Field(alias="currentWeek", default=1, ge=1)
    featured: bool = False
    weeks: list[WeekIn] = Field(default_factory=list, max_length=20)


class CourseUpdateIn(BaseModel):
    """Patch sebagian. Semua field opsional.

    Semua list & mapping di sini diproses dengan `exclude_unset=True`, jadi
    "tidak dikirim" berbeda dari "dikirim `null`":

    - `focus` tidak dikirim  -> kolomnya tidak disentuh
    - `focus: null` dikirim  -> kolomnya dikosongkan (bukan string kosong)
    - `tutor: null` dikirim  -> tutor dilepas dari matkul ini
    - `tutor` tidak dikirim  -> tutor yang ada dibiarkan

    Minggu yang tidak ada di `weeks` TIDAK dihapus. Menghapus butuh nilai
    `completed` yang sudah tercatat; menghapus diam-diam akan menghapus riwayat.
    """

    model_config = ConfigDict(populate_by_name=True)

    code: str | None = Field(default=None, min_length=2, max_length=32)
    title: str | None = Field(default=None, min_length=2, max_length=255)
    kind: CourseKind | None = None
    sks: int | None = Field(default=None, ge=0, le=12)
    focus: str | None = Field(default=None, max_length=1000)
    curriculum: str | None = Field(default=None, max_length=64)
    class_label: str | None = Field(
        alias="classLabel", default=None, min_length=1, max_length=64
    )
    room: str | None = Field(default=None, max_length=64)
    lecturer: LecturerIn | None = None
    tutor: TutorIn | None = None
    progress_percent: int | None = Field(
        alias="progressPercent", default=None, ge=0, le=100
    )
    current_week: int | None = Field(alias="currentWeek", default=None, ge=1)
    featured: bool | None = None
    weeks: list[WeekIn] | None = Field(default=None, max_length=20)
    is_active: bool | None = Field(
        alias="isActive", default=None, description="Nonaktifkan tanpa menghapus katalog"
    )


class ProgressIn(BaseModel):
    """Update progres. `progress_percent` boleh ditulis langsung (default
    yang dipilih), dan akan ditimpa kalau `week_no` + `completed` dikirim."""

    model_config = ConfigDict(populate_by_name=True)

    progress_percent: int | None = Field(
        alias="progressPercent", default=None, ge=0, le=100
    )
    current_week: int | None = Field(
        alias="currentWeek", default=None, ge=1
    )
    featured: bool | None = None
    week: WeekProgressIn | None = None


class TutorSessionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str | None = Field(
        alias="sessionId", default=None, max_length=128
    )
    message: str | None = Field(default=None, max_length=2000)


class TutorSessionOut(BaseModel):
    """Dipakai AppLayout untuk membuka chat yang sudah ter-scope ke matkul."""

    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    tutor_id: str = Field(alias="tutorId")
    tutor_name: str = Field(alias="tutorName")
    rag_namespace: str = Field(alias="ragNamespace")
    opening_prompt: str = Field(alias="openingPrompt")


class CourseIdListOut(BaseModel):
    """Helper kecil: daftar offering milik satu course (untuk filter FilesPage)."""

    model_config = ConfigDict(populate_by_name=True)

    course_id: str = Field(alias="courseId")
    course_title: str = Field(alias="courseTitle")
    offering_ids: list[str] = Field(
        alias="offeringIds", default_factory=list
    )


class CountOut(BaseModel):
    """Balasan hapus yang hanya perlu angka."""

    model_config = ConfigDict(populate_by_name=True)

    deleted: int = 0