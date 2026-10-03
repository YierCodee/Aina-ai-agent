"""Query & formatting untuk halaman Courses dan Files.

Semua angka di UI (total SKS, jumlah file, chunks, rata-rata progress, hitungan
quick view) dihitung di sini dari database, bukan disimpan. Konsekuensinya angka
di layar selalu benar terhadap isi tabel, dan tidak ada kolom yang bisa basi.

Tiga hal yang mudah salah dan karena itu ditulis eksplisit di sini:

1. **Fan-out.** `course_materials` tidak pernah di-join langsung ke query utama.
   Satu offering punya puluhan file, jadi join akan menggandakan baris enrollment
   dan membuat `SUM(sks)`/`AVG(progress)` jadi tidak benar. Materi
   diagregasi di subquery terpisah, atau lewat scalar subquery untuk metrics.

2. **Sort dari allowlist.** `ORDER BY` tidak pernah dibangun dari nilai request.
   Nilai `sort` dipetakan ke kolom lewat dict; yang tidak dikenal diabaikan.

3. **Alias JSON.** Output dibentuk lewat Pydantic di backend/schemas/courses.py,
   bukan dict manual, supaya nama key JSON ikut terkunci di satu tempat.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import uuid4

from sqlalchemy import Select, and_, case, delete, false, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.chat import ChatSession
from backend.models.course import (
    AiTutor,
    ConsultationSlot,
    Course,
    CourseMaterial,
    CourseOffering,
    CourseTutor,
    CourseWeek,
    Enrollment,
    Lecturer,
    MaterialFolder,
    OfferingLecturer,
    Term,
)
from backend.schemas.courses import (
    CourseCardOut,
    CourseCreateIn,
    CourseUpdateIn,
    CourseCounts,
    CourseDetailOut,
    CourseListOut,
    CourseMetrics,
    FolderBadge,
    FolderListOut,
    FolderOut,
    LecturerCard,
    MaterialAssistant,
    MaterialListOut,
    MaterialOut,
    MaterialStats,
    ProgressIn,
    SlotOut,
    TermCreateIn,
    TermListOut,
    TermOut,
    TutorCard,
    TutorDetail,
    TutorSessionOut,
    WeekOut,
)

logger = logging.getLogger(__name__)

# Status materi yang ikut dihitung sebagai "sudah terindeks". `queued` belum
# diproses dan `error` gagal, keduanya sengaja tidak dihitung.
COUNTED_MATERIAL_STATUSES = ("indexing", "ready", "indexed")

# Ambang quick view "Progress < 60%".
PROGRESS_BEHIND = 60

# Tab "recent" di FilesPage: 30 hari terakhir.
RECENT_DAYS = 30

DAY_SHORT = ("Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min")
DAY_ABBR = (
    "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu",
)
MONTH_SHORT = (
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
)

DEFAULT_USER = "mahasiswa"

CoursesSort = Literal["name", "progress", "sks"]
FilesSort = Literal["recent", "name", "size"]
FilesTab = Literal["all", "recent", "shared", "trash"]
QuickView = Literal["all", "teori", "praktikum", "progress"]


class NotFound(Exception):
    """Data yang diminta tidak ada. Router memetakan ke 404."""


class Conflict(Exception):
    """Permintaan bentrok dengan keadaan sekarang. Router memetakan ke 409.

    Dipakai untuk konflik yang bisa dijelaskan tanpa melihat pesan driver —
    misalnya "matkul ini sudah dilepas", yang `_conflict()` di router tidak
    akan pernah tangkap karena tidak ada yang menyentuh database.
    """


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------
def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def initial_of(name: str) -> str:
    """Huruf avatar dari nama, mis. "Dr. Ir. Budi Hartono, M.Kom." -> "B".

    Dibuat dengan melewati gelar supaya hasilnya sama dengan inisial yang
    dipilih manual di data lama. Nama jabatan ("Asisten Lab Web") dilewati juga.
    Kalau tidak ada yang tersisa, huruf pertama nama apa adanya.
    """
    skip = {
        "dr", "drs", "dra", "prof", "ir", "ir.", "asisten", "dosen", "mr", "mrs",
        "ms", "s.kom", "s.kom.", "s.t", "s.t.", "s.sos", "m.kom", "m.kom.",
        "m.t", "m.t.", "m.sc", "m.sc.", "ph.d", "ph.d.",
    }
    for part in name.split():
        cleaned = part.strip(".,").lower()
        if not cleaned or cleaned in skip:
            continue
        return part.strip(".,")[0].upper()
    return "?"


def consult_label(slots: list[tuple[int, time, time]]) -> str:
    """Bentuk label jadwal dari baris slot yang sudah terurut.

    Meniru format data lama:
    - satu hari  -> nama penuh: "Senin 10:00 - 12:00"
    - dua hari   -> singkatan digabung: "Sel & Kam 13:00 - 15:00"
    - lebih dari dua, jam sama -> "Sel, Rab & Kam 13:00 - 15:00"
    Kosong kalau tidak ada slot, supaya `CourseCard` tidak menampilkan
    "Konsultasi: " tanpa isi.
    """
    if not slots:
        return ""
    ordered = sorted(slots, key=lambda s: s[0])
    groups: list[list[tuple[int, time, time]]] = []
    for entry in ordered:
        if groups and groups[-1][0][1] == entry[1] and groups[-1][0][2] == entry[2]:
            groups[-1].append(entry)
        else:
            groups.append([entry])

    parts: list[str] = []
    for group in groups:
        days = [g[0] for g in group]
        if len(days) == 1:
            label = DAY_ABBR[days[0] - 1]
        elif len(days) == 2:
            label = f"{DAY_SHORT[days[0] - 1]} & {DAY_SHORT[days[1] - 1]}"
        else:
            label = ", ".join(DAY_SHORT[d - 1] for d in days[:-1])
            label += f" & {DAY_SHORT[days[-1] - 1]}"
        parts.append(
            f"{label} {group[0][1].strftime('%H:%M')} - {group[0][2].strftime('%H:%M')}"
        )
    return ", ".join(parts)


def week_label(week_no: int | None, title: str | None) -> str:
    if not week_no:
        return ""
    return f"Minggu {week_no}: {title}" if title else f"Minggu {week_no}"


def size_label(size_mb: float) -> float | str:
    """>= 1 MB tampil sebagai MB, di bawah itu KB.

    Aturan yang sama dengan jalur upload lama di FilesPage. `size_mb` dikembalikan
    apa adanya supaya field numeriknya tidak ikut jadi string.
    """
    if size_mb >= 1:
        return f"{size_mb:.1f} MB"
    return f"{max(1, round(size_mb * 1024))} KB"


def total_size_label(total_mb: float) -> str:
    if total_mb >= 1024:
        return f"{total_mb / 1024:.1f} GB"
    return f"{max(1, round(total_mb))} MB"


def modified_label(when: datetime | None) -> str:
    """Label relatif ringkas: "Today, 10:45 AM" / "Yesterday" / "Oct 12, 2025"."""
    if when is None:
        return ""
    now = _utcnow()
    day = when.date()
    if day == now.date():
        return f"Today, {when.strftime('%I:%M %p').lstrip('0')}"
    if day == (now - timedelta(days=1)).date():
        return "Yesterday"
    if when.year == now.year:
        return f"{MONTH_SHORT[day.month - 1]} {day.day}"
    return f"{MONTH_SHORT[day.month - 1]} {day.day}, {when.year}"


def ago_label(when: datetime | None) -> str:
    if when is None:
        return ""
    delta = _utcnow() - when
    hours = delta.total_seconds() / 3600
    if hours < 1:
        return f"{max(1, round(hours * 60))} mins ago"
    if hours < 24:
        return f"{round(hours)} hrs ago"
    days = round(hours / 24)
    if days <= 1:
        return "Yesterday"
    if days < 30:
        return f"{days} days ago"
    return f"{round(days / 30)} mo ago"


# ---------------------------------------------------------------------------
# Subquery aggregate materi
# ---------------------------------------------------------------------------
def _material_counts_subquery():
    """(files, chunks) per offering. Dipakai sebagai subquery, bukan join."""
    return (
        select(
            CourseMaterial.offering_id.label("offering_id"),
            func.count().label("files"),
            func.coalesce(func.sum(CourseMaterial.chunk_count), 0).label("chunks"),
        )
        .where(
            CourseMaterial.offering_id.is_not(None),
            CourseMaterial.status.in_(COUNTED_MATERIAL_STATUSES),
        )
        .group_by(CourseMaterial.offering_id)
        .subquery()
    )


# Kolom yang dikembalikan ke `_row_to_card`. Dipisah supaya query list dan query
# count bisa berbagi satu daftar join — kalau dipisah, hasil keduanya bisa beda.
def _card_columns(counts):
    return (
        Course.id,
        Course.code,
        Course.title,
        Course.sks,
        Course.kind,
        Course.focus,
        CourseOffering.id.label("offering_id"),
        CourseOffering.class_label,
        Enrollment.progress_percent,
        Enrollment.current_week,
        Enrollment.featured,
        CourseWeek.title.label("week_title"),
        Lecturer.name.label("lecturer_name"),
        Lecturer.email.label("lecturer_email"),
        Lecturer.avatar_tone,
        AiTutor.name.label("tutor_name"),
        AiTutor.description.label("tutor_desc"),
        AiTutor.emoji.label("tutor_emoji"),
        func.coalesce(counts.c.files, 0).label("rag_files"),
        func.coalesce(counts.c.chunks, 0).label("rag_chunks"),
    )


# ---------------------------------------------------------------------------
# Filter dasar: enrollment aktif pada term aktif milik satu user
# ---------------------------------------------------------------------------
def _apply_list_filters(
    stmt: Select,
    *,
    q: str,
    tab: str,
    quick_view: str,
) -> Select:
    """Terapkan filter yang setara dengan logika frontend.

    `q` mencari di title + kode + nama dosen + nama tutor, sama seperti
    CoursesPage.quickView lama. Sisi database memakai LIKE dengan `%` + `q`
    yang sudah di-escape.
    """
    if tab in ("teori", "praktikum"):
        stmt = stmt.where(Course.kind == tab)
    if quick_view == "teori":
        stmt = stmt.where(Course.kind == "teori")
    elif quick_view == "praktikum":
        stmt = stmt.where(Course.kind == "praktikum")
    elif quick_view == "progress":
        stmt = stmt.where(Enrollment.progress_percent < PROGRESS_BEHIND)
    if q:
        needle = f"%{_escape_like(q.strip().lower())}%"
        stmt = stmt.where(
            or_(
                func.lower(Course.title).like(needle, escape="\\"),
                func.lower(Course.code).like(needle, escape="\\"),
                func.lower(Lecturer.name).like(needle, escape="\\"),
                func.lower(AiTutor.name).like(needle, escape="\\"),
            )
        )
    return stmt


def _escape_like(text: str) -> str:
    for char in ("\\", "%", "_"):
        text = text.replace(char, "\\" + char)
    return text


_COURSE_SORT = {
    "name": lambda: Course.title.asc(),
    "sks": lambda: Course.sks.desc(),
    "progress": lambda: Enrollment.progress_percent.desc(),
}


def _course_order(sort: str) -> list:
    """Urut dari allowlist. Nilai tak dikenal -> default (progress)."""
    builder = _COURSE_SORT.get(sort, _COURSE_SORT["progress"])
    # Title sebagai pemutus akhir supaya urutannya deterministik antar-request;
    # tanpa ini dua course dengan progress sama bisa bertukar tempat tiap call.
    return [builder(), Course.title.asc()]


# ---------------------------------------------------------------------------
# Query utama
# ---------------------------------------------------------------------------
async def _fetch_course_rows(
    db: AsyncSession,
    *,
    user_id: str,
    q: str,
    tab: str,
    quick_view: str,
    sort: str,
    limit: int,
    offset: int,
) -> tuple[list, int, str, dict[str, str]]:
    counts = _material_counts_subquery()
    # JOIN dengan ON langsung, bukan outerjoin(tablename, ...). Tabel-nya belum
    # masuk FROM saat filter ini disusun, jadi harus disambung sebagai ON.
    on_primary_lecturer = and_(
        OfferingLecturer.offering_id == CourseOffering.id,
        OfferingLecturer.is_primary.is_(True),
    )
    on_primary_tutor = and_(
        CourseTutor.offering_id == CourseOffering.id,
        CourseTutor.is_primary.is_(True),
    )
    on_current_week = and_(
        CourseWeek.offering_id == CourseOffering.id,
        CourseWeek.week_no == Enrollment.current_week,
    )

    joins = [
        (CourseOffering, and_(Enrollment.offering_id == CourseOffering.id), False),
        (Course, and_(CourseOffering.course_id == Course.id), False),
        (Term, and_(CourseOffering.term_id == Term.id), False),
        (OfferingLecturer, on_primary_lecturer, True),
        (Lecturer, and_(OfferingLecturer.lecturer_id == Lecturer.id), True),
        (CourseTutor, on_primary_tutor, True),
        (AiTutor, and_(CourseTutor.tutor_id == AiTutor.id), True),
        (CourseWeek, on_current_week, True),
        (counts, and_(counts.c.offering_id == CourseOffering.id), True),
    ]
    where = and_(
        Enrollment.user_id == user_id,
        Enrollment.status == "aktif",
        Term.is_active.is_(True),
    )

    def _joins() -> Select:
        stmt = select(*_card_columns(counts)).select_from(Enrollment)
        for target, on, outer in joins:
            stmt = stmt.join(target, on, isouter=outer)
        return stmt

    base = _apply_list_filters(_joins(), q=q, tab=tab, quick_view=quick_view)
    count_stmt = _apply_list_filters(
        _joins().with_only_columns(func.count()), q=q, tab=tab, quick_view=quick_view
    ).where(where)

    total = (await db.execute(count_stmt)).scalar_one()

    rows = (
        await db.execute(
            base.where(where)
            .order_by(*_course_order(sort))
            .limit(max(1, min(limit, 200)))
            .offset(max(offset, 0))
        )
    ).all()
    term_label = (
        await db.execute(select(Term.label).where(Term.is_active.is_(True)))
    ).scalar_one_or_none() or ""

    # Label jadwal tidak bisa diambil lewat join: satu offering punya 1-2 slot
    # dengan jam berbeda, dan labelnya sudah digabung ("Sel & Kam 13:00 - 15:00").
    # Jadi slot diambil terpisah untuk offering di halaman ini saja, lalu
    # diformat di Python.
    consults = await _consult_labels(
        db, [r.offering_id for r in rows if r.offering_id]
    )
    return list(rows), int(total), term_label, consults


async def _consult_labels(
    db: AsyncSession, offering_ids: list[str]
) -> dict[str, str]:
    """Map `offering_id` -> label jadwal gabungan."""
    if not offering_ids:
        return {}
    rows = (
        await db.execute(
            select(
                ConsultationSlot.offering_id,
                ConsultationSlot.day_of_week,
                ConsultationSlot.starts_at,
                ConsultationSlot.ends_at,
            )
            .where(ConsultationSlot.offering_id.in_(offering_ids))
            .order_by(
                ConsultationSlot.offering_id,
                ConsultationSlot.day_of_week,
                ConsultationSlot.starts_at,
            )
        )
    ).all()
    grouped: dict[str, list[tuple[int, time, time]]] = {}
    for r in rows:
        grouped.setdefault(r.offering_id, []).append(
            (r.day_of_week, r.starts_at, r.ends_at)
        )
    return {oid: consult_label(slots) for oid, slots in grouped.items()}


async def _fetch_counts(db: AsyncSession, *, user_id: str) -> CourseCounts:
    """Empat angka quick view dalam satu pass.

    Tidak ikut filter `q`/`tab` — di UI, counts sidebar selalu dihitung dari
    seluruh matkul, bukan dari hasil pencarian yang sedang diketik.
    """
    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.coalesce(
                    func.sum(case((Course.kind == "teori", 1), else_=0)), 0
                ).label("teori"),
                func.coalesce(
                    func.sum(case((Course.kind == "praktikum", 1), else_=0)), 0
                ).label("praktikum"),
                func.coalesce(
                    func.sum(
                        case(
                            (Enrollment.progress_percent < PROGRESS_BEHIND, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("behind"),
            )
            .select_from(Enrollment)
            .join(CourseOffering, Enrollment.offering_id == CourseOffering.id)
            .join(Course, CourseOffering.course_id == Course.id)
            .join(Term, CourseOffering.term_id == Term.id)
            .where(
                Enrollment.user_id == user_id,
                Enrollment.status == "aktif",
                Term.is_active.is_(True),
            )
        )
    ).one()
    return CourseCounts(
        all=int(row.total),
        teori=int(row.teori),
        praktikum=int(row.praktikum),
        progress=int(row.behind),
    )


async def _fetch_metrics(db: AsyncSession, *, user_id: str) -> CourseMetrics:
    """Angka untuk 4 metric card + angka sidebar.

    Tiga agregat tambahan (file, tutor, sandbox) memakai scalar subquery, bukan
    join. Kalau `course_materials` di-join ke sini, satu offering dengan 30 file
    akan menggandakan 30 baris dan `SUM(sks)` meledak. Ini alasannya.
    """
    enrolled_offerings = (
        select(Enrollment.offering_id)
        .join(CourseOffering, Enrollment.offering_id == CourseOffering.id)
        .join(Term, CourseOffering.term_id == Term.id)
        .where(
            Enrollment.user_id == user_id,
            Enrollment.status == "aktif",
            Term.is_active.is_(True),
        )
        .scalar_subquery()
    )
    counted_materials = (
        select(func.count())
        .select_from(CourseMaterial)
        .where(
            CourseMaterial.offering_id.in_(enrolled_offerings),
            CourseMaterial.status.in_(COUNTED_MATERIAL_STATUSES),
        )
        .scalar_subquery()
    )
    distinct_tutors = (
        select(func.count(func.distinct(CourseTutor.tutor_id)))
        .where(CourseTutor.offering_id.in_(enrolled_offerings))
        .scalar_subquery()
    )
    sandboxed = (
        select(
            func.count(func.distinct(CourseTutor.offering_id))
        ).where(
            CourseTutor.offering_id.in_(enrolled_offerings),
            CourseTutor.rag_namespace.is_not(None),
        ).scalar_subquery()
    )

    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.coalesce(func.sum(Course.sks), 0).label("sks"),
                func.coalesce(func.round(func.avg(Enrollment.progress_percent)), 0).label(
                    "avg_progress"
                ),
                counted_materials.label("files"),
                distinct_tutors.label("tutors"),
                sandboxed.label("sandboxed"),
            )
            .select_from(Enrollment)
            .join(CourseOffering, Enrollment.offering_id == CourseOffering.id)
            .join(Course, CourseOffering.course_id == Course.id)
            .join(Term, CourseOffering.term_id == Term.id)
            .where(
                Enrollment.user_id == user_id,
                Enrollment.status == "aktif",
                Term.is_active.is_(True),
            )
        )
    ).one()

    total = int(row.total)
    isolation = round(int(row.sandboxed) * 100 / total) if total else 0
    return CourseMetrics(
        total_courses=total,
        total_sks=int(row.sks),
        total_files=int(row.files),
        avg_progress=int(row.avg_progress),
        dedicated_tutors=int(row.tutors),
        rag_isolation=isolation,
    )


async def list_courses(
    db: AsyncSession,
    *,
    user_id: str = DEFAULT_USER,
    q: str = "",
    tab: str = "all",
    quick_view: str = "all",
    sort: str = "progress",
    limit: int = 100,
    offset: int = 0,
) -> CourseListOut:
    """Satu round-trip untuk seluruh halaman Courses."""
    rows, total, term_label, consults = await _fetch_course_rows(
        db,
        user_id=user_id,
        q=q,
        tab=tab,
        quick_view=quick_view,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    items = [_row_to_card(row, consults.get(row.offering_id, "")) for row in rows]
    return CourseListOut(
        total=total,
        items=items,
        counts=await _fetch_counts(db, user_id=user_id),
        metrics=await _fetch_metrics(db, user_id=user_id),
        term_label=term_label,
    )


def _row_to_card(row, consult: str = "") -> CourseCardOut:
    """Baris query -> DTO. Nama field di sini harus sama dengan select() di atas."""
    return CourseCardOut(
        id=row.id,
        code=row.code,
        title=row.title,
        sks=row.sks,
        kelas=row.class_label,
        kind=row.kind,
        focus=row.focus or "",
        week_label=week_label(row.current_week, row.week_title),
        progress=int(row.progress_percent),
        rag_files=int(row.rag_files),
        rag_chunks=int(row.rag_chunks),
        lecturer=LecturerCard(
            name=row.lecturer_name or "Dosen belum ditetapkan",
            initial=initial_of(row.lecturer_name or "?"),
            tone=row.avatar_tone or "secondary",
            consult=consult,
            email=row.lecturer_email,
        ),
        tutor=(
            TutorCard(
                name=row.tutor_name,
                desc=row.tutor_desc or "",
                emoji=row.tutor_emoji or "\U0001f916",
            )
            if row.tutor_name
            else None
        ),
        featured=bool(row.featured),
    )


async def get_course_detail(
    db: AsyncSession, course_id: str, *, user_id: str = DEFAULT_USER
) -> CourseDetailOut:
    """Detail satu matkul: kartu + minggu + slot konsultasi + tutor."""
    card = await _card_for(db, course_id, user_id=user_id)

    offering_id = await _offering_id_for(db, course_id, user_id=user_id)
    term = (
        await db.execute(
            select(Term)
            .join(CourseOffering, CourseOffering.term_id == Term.id)
            .where(CourseOffering.id == offering_id)
        )
    ).scalar_one()

    week_rows = (
        await db.execute(
            select(CourseWeek)
            .where(CourseWeek.offering_id == offering_id)
            .order_by(CourseWeek.week_no)
        )
    ).scalars().all()
    weeks = [
        WeekOut(
            week_no=w.week_no,
            title=w.title,
            meeting_kind=w.meeting_kind,
            planned_on=w.planned_on,
            completed=w.completed_at is not None,
        )
        for w in week_rows
    ]

    slot_rows = (
        await db.execute(
            select(ConsultationSlot)
            .where(ConsultationSlot.offering_id == offering_id)
            .order_by(ConsultationSlot.day_of_week, ConsultationSlot.starts_at)
        )
    ).scalars().all()
    slots = [
        SlotOut(
            day_of_week=s.day_of_week,
            starts_at=s.starts_at,
            ends_at=s.ends_at,
            room=s.room,
            location=s.location,
        )
        for s in slot_rows
    ]

    tutor_row = (
        await db.execute(
            select(AiTutor, CourseTutor.rag_namespace, CourseTutor.temperature)
            .join(CourseTutor, CourseTutor.tutor_id == AiTutor.id)
            .where(
                CourseTutor.offering_id == offering_id,
                CourseTutor.is_primary.is_(True),
            )
        )
    ).first()
    tutor = None
    if tutor_row is not None:
        t, namespace, temperature = tutor_row
        tutor = TutorDetail(
            id=t.id,
            name=t.name,
            description=t.description,
            emoji=t.emoji,
            status=t.status,
            model=t.model,
            rag_namespace=namespace or "",
            temperature=float(temperature or 0.3),
        )

    return CourseDetailOut(
        course=card.model_copy(deep=True),
        term=TermOut(
            id=term.id,
            label=term.label,
            academic_year=term.academic_year,
            semester_no=term.semester_no,
            starts_on=term.starts_on,
            ends_on=term.ends_on,
        ),
        weeks=weeks,
        consultation=slots,
        tutor=tutor,
    )


async def _offering_id_for(
    db: AsyncSession,
    course_id: str,
    *,
    user_id: str = DEFAULT_USER,
    statuses: tuple[str, ...] = ("aktif",),
    require_active_term: bool = True,
) -> str:
    """Offering milik `user_id` untuk satu `course_id`.

    `statuses` perlu dilebarkan untuk jalur soft-delete: `drop_enrollment` dan
    `restore_enrollment` harus menemukan enrollment yang `dropped` juga, sedangkan
    semua operasi lain hanya boleh menyentuh yang `aktif`.
    """
    offering_id = (
        await db.execute(
            select(Enrollment.offering_id)
            .join(CourseOffering, Enrollment.offering_id == CourseOffering.id)
            .join(Course, CourseOffering.course_id == Course.id)
            .join(Term, CourseOffering.term_id == Term.id)
            .where(
                Course.id == course_id,
                Enrollment.user_id == user_id,
                Enrollment.status.in_(statuses),
                *([Term.is_active.is_(True)] if require_active_term else []),
            )
        )
    ).scalar_one_or_none()
    if offering_id is None:
        raise NotFound("Mata kuliah tidak ditemukan.")
    return offering_id


async def _card_for(
    db: AsyncSession, course_id: str, *, user_id: str = DEFAULT_USER
) -> CourseCardOut:
    """Kartu matkul setelah perubahan, lewat jalur query yang sama dengan list.

    Sengaja memanggil `list_courses` daripada menulis ulang pemetaannya: bentuk
    kartu yang dikembalikan create/update/edit pasti identik dengan yang
    dirender halaman, jadi tidak ada jalur yang bisa melenceng.
    """
    listing = await list_courses(db, user_id=user_id, sort="name")
    card = next((c for c in listing.items if c.id == course_id), None)
    if card is None:
        raise NotFound("Mata kuliah tidak ditemukan.")
    return card


async def update_progress(
    db: AsyncSession,
    course_id: str,
    payload: ProgressIn,
    *,
    user_id: str = DEFAULT_USER,
) -> CourseCardOut:
    """Update progres. Menulis ulang kartu yang berubah supaya bisa refetch.

    Kalau payload menyertakan `week`, `progress_percent` dihitung ulang dari
    minggu yang selesai — nilai yang dikirim manual jadi tidak dihiraukan.
    """
    offering_id = await _offering_id_for(db, course_id, user_id=user_id)
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.offering_id == offering_id,
                Enrollment.user_id == user_id,
            )
        )
    ).scalar_one()

    if payload.week is not None:
        await _apply_week_toggle(db, offering_id, enrollment, payload)

    if payload.progress_percent is not None:
        enrollment.progress_percent = payload.progress_percent
    if payload.current_week is not None:
        enrollment.current_week = payload.current_week
    if payload.featured is not None:
        enrollment.featured = payload.featured
    enrollment.last_opened_at = _utcnow()
    await db.commit()

    listing = await list_courses(db, user_id=user_id, sort="name")
    card = next((c for c in listing.items if c.id == course_id), None)
    if card is None:
        raise NotFound("Mata kuliah tidak ditemukan.")
    return card


async def _apply_week_toggle(
    db: AsyncSession, offering_id: str, enrollment: Enrollment, payload: ProgressIn
) -> None:
    week = payload.week
    target_no = week.week_no if week and week.week_no else enrollment.current_week
    row = (
        await db.execute(
            select(CourseWeek).where(
                CourseWeek.offering_id == offering_id,
                CourseWeek.week_no == target_no,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Minggu tersebut tidak ada di silabus.")

    row.completed_at = None if (week and week.completed is False) else _utcnow()

    total = (
        await db.execute(
            select(func.count())
            .select_from(CourseWeek)
            .where(CourseWeek.offering_id == offering_id)
        )
    ).scalar_one()
    done = (
        await db.execute(
            select(func.count())
            .select_from(CourseWeek)
            .where(
                CourseWeek.offering_id == offering_id,
                CourseWeek.completed_at.is_not(None),
            )
        )
    ).scalar_one()
    if total:
        enrollment.progress_percent = round(int(done) * 100 / int(total))


# ---------------------------------------------------------------------------
# CRUD matkul
#
# CATATAN TENTANG URUTAN INSERT
#
# Model tidak punya `relationship()` (lihat models/course.py), dan unit of work
# SQLAlchemy hanya mengurutkan flush berdasarkan relationship — bukan kolom FK.
# Artinya urutan di bawah WAJIB diikuti, dan tiap level dipisah `flush()`.
# Melewati satu flush akan berakhir sebagai IntegrityError "FOREIGN KEY
# constraint failed" dengan pesan yang tidak menunjuk baris yang salah.
# ---------------------------------------------------------------------------
async def _upsert_lecturer(db: AsyncSession, spec: dict) -> str:
    """Resolve ke `lecturers.id`. Buat baru kalau tidak ditemukan.

    Dua jalur, satu perilaku: baik berdasarkan `id` maupun berdasarkan `name`,
    field dari form SELALU diterapkan. Versi awal hanya menerapkannya di jalur
    `id` — jadi dosen yang ditemukan by-name memakai ulang baris dengan tone
    lama, padahal form mengirim tone baru. Bug itu ketahuan lewat test.
    """
    lecturer_id = spec.get("id")
    if lecturer_id:
        found = await db.get(Lecturer, lecturer_id)
        if found is None:
            raise NotFound(f"Dosen dengan id {lecturer_id} tidak ada.")
    else:
        name = (spec.get("name") or "").strip()
        if not name:
            raise Conflict("Nama dosen wajib diisi.")
        found = (
            await db.execute(select(Lecturer).where(Lecturer.name == name))
        ).scalar_one_or_none()
        if found is None:
            found = Lecturer(
                id=f"lec-{slug(name)}-{uuid4().hex[:6]}",
                name=name,
                email=spec.get("email"),
                avatar_tone=spec.get("avatar_tone") or "secondary",
            )
            db.add(found)
            await db.flush()
            return found.id

    # Nama/email/tone ikut diperbarui supaya menyunting dosen tidak butuh
    # endpoint terpisah. `or=` menjaga nilai lama kalau field tidak dikirim.
    if spec.get("name"):
        found.name = spec["name"]
    if spec.get("email") is not None:
        found.email = spec["email"]
    found.avatar_tone = spec.get("avatar_tone") or found.avatar_tone
    return found.id


async def _upsert_tutor(db: AsyncSession, spec: dict) -> str:
    """Resolve ke `ai_tutors.id`. Sama seperti `_upsert_lecturer`."""
    tutor_id = spec.get("id")
    if tutor_id:
        found = await db.get(AiTutor, tutor_id)
        if found is None:
            raise NotFound(f"Tutor dengan id {tutor_id} tidak ada.")
    else:
        name = (spec.get("name") or "").strip()
        if not name:
            raise Conflict("Nama tutor wajib diisi.")
        found = (
            await db.execute(select(AiTutor).where(AiTutor.name == name))
        ).scalar_one_or_none()
        if found is None:
            found = AiTutor(
                id=f"tut-{slug(name)}-{uuid4().hex[:6]}",
                name=name,
                description=spec.get("description") or f"Asisten AI untuk {name}.",
                emoji=spec.get("emoji") or "\U0001f916",
                model=spec.get("model"),
                status="running",
            )
            db.add(found)
            await db.flush()
            return found.id

    if spec.get("name"):
        found.name = spec["name"]
    if spec.get("description"):
        found.description = spec["description"]
    if spec.get("emoji"):
        found.emoji = spec["emoji"]
    if spec.get("model"):
        found.model = spec["model"]
    return found.id


def slug(text: str) -> str:
    """Bagian id yang aman: huruf kecil, hanya alfanumerik, maksimal 24 char."""
    cleaned = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:24] or "x"


async def _apply_weeks(
    db: AsyncSession, offering_id: str, specs: list[dict]
) -> None:
    """Upsert minggu berdasarkan `week_no`. Minggu di luar `specs` tidak dihapus."""
    for spec in specs:
        week_no = spec["week_no"]
        row = (
            await db.execute(
                select(CourseWeek).where(
                    CourseWeek.offering_id == offering_id,
                    CourseWeek.week_no == week_no,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            db.add(
                CourseWeek(
                    offering_id=offering_id,
                    week_no=week_no,
                    title=spec["title"],
                    meeting_kind=spec.get("meeting_kind") or "teori",
                    completed_at=_utcnow() if spec.get("completed") else None,
                )
            )
            continue
        row.title = spec["title"]
        if spec.get("meeting_kind"):
            row.meeting_kind = spec["meeting_kind"]
        if "completed" in spec:
            row.completed_at = _utcnow() if spec["completed"] else None
    await db.flush()


async def _has_active_enrollment(
    db: AsyncSession, course_id: str, *, user_id: str = DEFAULT_USER
) -> bool:
    """Apakah user sudah punya enrollment `aktif` untuk course ini di semester aktif."""
    return (
        await db.execute(
            select(Enrollment.id)
            .join(CourseOffering, Enrollment.offering_id == CourseOffering.id)
            .join(Term, CourseOffering.term_id == Term.id)
            .where(
                CourseOffering.course_id == course_id,
                Enrollment.user_id == user_id,
                Enrollment.status == "aktif",
                Term.is_active.is_(True),
            )
            .limit(1)
        )
    ).first() is not None


async def _relink_offering(
    db: AsyncSession, offering_id: str, lecturer_id: str, tutor_id: str | None
) -> None:
    """Pasang dosen & tutor ke offering, ganti yang lama kalau ada.

    Dipakai saat daftar ulang supaya course yang di-soft-delete tidak bring along
    dosen/tutor lamanya padahal form sudah mengisinya.
    """
    link = (
        await db.execute(
            select(OfferingLecturer).where(
                OfferingLecturer.offering_id == offering_id,
                OfferingLecturer.is_primary.is_(True),
            )
        )
    ).scalar_one_or_none()
    if link is None:
        db.add(
            OfferingLecturer(
                offering_id=offering_id,
                lecturer_id=lecturer_id,
                role="utama",
                is_primary=True,
            )
        )
    else:
        link.lecturer_id = lecturer_id

    existing_tutor = (
        await db.execute(
            select(CourseTutor).where(
                CourseTutor.offering_id == offering_id,
                CourseTutor.is_primary.is_(True),
            )
        )
    ).scalar_one_or_none()
    if tutor_id is None:
        if existing_tutor is not None:
            await db.execute(
                delete(CourseTutor).where(CourseTutor.offering_id == offering_id)
            )
    elif existing_tutor is None:
        db.add(
            CourseTutor(
                offering_id=offering_id,
                tutor_id=tutor_id,
                rag_namespace=f"course-{offering_id}",
                is_primary=True,
                temperature=0.3,
            )
        )
    else:
        existing_tutor.tutor_id = tutor_id
    await db.flush()


async def list_terms(db: AsyncSession) -> TermListOut:
    """Semua semester, yang aktif di depan.

    Dipakai dialog pengelola semester di halaman Courses. `activeId` null
    kalau belum ada term sama sekali — kondisi yang bikin enroll gagal 409.
    """
    rows = (
        await db.execute(
            select(Term).order_by(
                Term.is_active.desc(),
                Term.starts_on.desc().nullslast(),
                Term.label.asc(),
            )
        )
    ).scalars().all()
    active_id = next((t.id for t in rows if t.is_active), None)
    return TermListOut(
        items=[TermOut.model_validate(t, from_attributes=True) for t in rows],
        active_id=active_id,
    )


async def create_term(db: AsyncSession, payload: TermCreateIn) -> TermOut:
    """Buat semester baru. `activate=True` menonaktifkan term lain dulu.

    ID diturunkan dari tahun ajaran + nomor semester ("2025-1") supaya
    deterministik seperti seed — duplikat jadi IntegrityError yang dipetakan
    router ke 409, bukan 500.
    """
    if payload.starts_on and payload.ends_on and payload.ends_on < payload.starts_on:
        raise Conflict("Tanggal selesai tidak boleh sebelum tanggal mulai.")

    term = Term(
        id=f"{payload.academic_year[:4]}-{payload.semester_no}",
        label=payload.label.strip(),
        academic_year=payload.academic_year,
        semester_no=payload.semester_no,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        is_active=False,
    )
    db.add(term)
    await db.flush()

    if payload.activate:
        await _set_active_term(db, term.id)
    await db.commit()
    return TermOut.model_validate(term, from_attributes=True)


async def activate_term(db: AsyncSession, term_id: str) -> TermOut:
    """Aktifkan satu semester, nonaktifkan yang lain.

    Idempotent: mengaktifkan term yang sudah aktif tetap 200.
    """
    term = (
        await db.execute(select(Term).where(Term.id == term_id))
    ).scalar_one_or_none()
    if term is None:
        raise NotFound(f"Term {term_id} tidak ditemukan.")
    await _set_active_term(db, term_id)
    await db.commit()
    return TermOut.model_validate(term, from_attributes=True)


async def _set_active_term(db: AsyncSession, term_id: str) -> None:
    """Set tepat satu term aktif dalam satu transaksi.

    Partial unique index `ux_terms_active` hanya melindungi saat commit, jadi
    baris lain harus di-set False dulu sebelum target di-set True — kalau
    tidak, update target duluan bisa melanggar index di tengah transaksi.
    """
    await db.execute(
        update(Term).where(Term.id != term_id).values(is_active=False)
    )
    await db.execute(
        update(Term).where(Term.id == term_id).values(is_active=True)
    )
    await db.flush()


async def create_course(
    db: AsyncSession,
    payload: CourseCreateIn,
    *,
    user_id: str = DEFAULT_USER,
) -> CourseCardOut:
    """Daftarkan satu matkul ke semester aktif: course + offering + enrollment.

    Semua dalam satu transaksi. Kalau salah satu level gagal, tidak ada baris
    yang tertinggal — penting untuk form yang mengirim ~15 field sekaligus.
    """
    term_id = (
        await db.execute(select(Term.id).where(Term.is_active.is_(True)))
    ).scalar_one_or_none()
    if term_id is None:
        raise Conflict("Tidak ada semester aktif. Buat term dulu sebelum mendaftarkan matkul.")

    code = payload.code.strip()
    existing = (
        await db.execute(select(Course).where(Course.code == code))
    ).scalar_one_or_none()

    if existing is not None and await _has_active_enrollment(
        db, existing.id, user_id=user_id
    ):
        raise Conflict(f"Kode matkul {code} sudah dipakai.")

    lecturer_id = await _upsert_lecturer(db, payload.lecturer.model_dump(by_alias=False))
    tutor_id = (
        await _upsert_tutor(db, payload.tutor.model_dump(by_alias=False))
        if payload.tutor
        else None
    )

    if existing is not None:
        # Kode sudah ada di katalog tapi enrollment-nya sudah `dropped` — ini
        # daftar ulang, bukan duplikat. Offering lama DIPAKAI ULANG supaya
        # materinya dan silabusnya tidak terorphan, dan halaman tetap punya
        # jalan keluar dari dead-end "kode sudah dipakai padahal sudah dilepas".
        offering = (
            await db.execute(
                select(CourseOffering).where(
                    CourseOffering.course_id == existing.id,
                    CourseOffering.term_id == term_id,
                )
            )
        ).scalar_one_or_none()
        if offering is None:
            offering = CourseOffering(
                id=f"off-{term_id}-{existing.id}",
                course_id=existing.id,
                term_id=term_id,
                class_label=payload.class_label,
                room=payload.room,
                status="aktif",
            )
            db.add(offering)
            await db.flush()
        else:
            offering.class_label = payload.class_label
            offering.room = payload.room
            offering.status = "aktif"

        existing.title = payload.title.strip()
        existing.kind = payload.kind
        existing.sks = payload.sks
        existing.focus = payload.focus
        existing.curriculum = payload.curriculum
        existing.is_active = True

        await _relink_offering(db, offering.id, lecturer_id, tutor_id)
        enrollment = (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.offering_id == offering.id,
                    Enrollment.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if enrollment is None:
            enrollment = Enrollment(
                id=f"enr-{term_id}-{existing.id}",
                user_id=user_id,
                offering_id=offering.id,
            )
            db.add(enrollment)
        enrollment.progress_percent = payload.progress_percent
        enrollment.current_week = payload.current_week
        enrollment.featured = payload.featured
        enrollment.status = "aktif"

        if payload.weeks:
            await _apply_weeks(
                db, offering.id, [w.model_dump(by_alias=False) for w in payload.weeks]
            )
        await db.commit()
        return await _card_for(db, existing.id, user_id=user_id)

    # Level 1 — katalog + orang.
    course_id = f"c-{slug(code)}-{uuid4().hex[:6]}"
    db.add(
        Course(
            id=course_id,
            code=code,
            title=payload.title.strip(),
            kind=payload.kind,
            sks=payload.sks,
            focus=payload.focus,
            curriculum=payload.curriculum,
            is_active=True,
        )
    )
    await db.flush()

    # Level 2 — offering (butuh course + term).
    offering_id = f"off-{term_id}-{course_id}"
    db.add(
        CourseOffering(
            id=offering_id,
            course_id=course_id,
            term_id=term_id,
            class_label=payload.class_label,
            room=payload.room,
            status="aktif",
        )
    )
    await db.flush()

    # Level 3 — anak dari offering.
    db.add(
        OfferingLecturer(
            offering_id=offering_id,
            lecturer_id=lecturer_id,
            role="utama",
            is_primary=True,
        )
    )
    if tutor_id:
        db.add(
            CourseTutor(
                offering_id=offering_id,
                tutor_id=tutor_id,
                rag_namespace=f"course-{offering_id}",
                is_primary=True,
                temperature=0.3,
            )
        )
    db.add(
        Enrollment(
            id=f"enr-{term_id}-{course_id}",
            user_id=user_id,
            offering_id=offering_id,
            progress_percent=payload.progress_percent,
            current_week=payload.current_week,
            featured=payload.featured,
            status="aktif",
        )
    )
    if payload.weeks:
        await _apply_weeks(
            db, offering_id, [w.model_dump(by_alias=False) for w in payload.weeks]
        )

    await db.commit()
    return await _card_for(db, course_id, user_id=user_id)


async def update_course(
    db: AsyncSession,
    course_id: str,
    payload: CourseUpdateIn,
    *,
    user_id: str = DEFAULT_USER,
) -> CourseCardOut:
    """Patch sebagian pada tiga lapis: katalog, offering, dan enrollment.

    Dikelompokkan per tabel dengan sengaja. `class_label` hanya menyentuh
    `course_offerings`; `title` hanya `courses`. Kalau dicampur, satu edit
    akan mengubah offering milik semester lain yang memakai course yang sama.
    """
    offering_id = await _offering_id_for(db, course_id, user_id=user_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)

    catalog_fields = {
        "code", "title", "kind", "sks", "focus", "curriculum", "is_active",
    }
    offering_fields = {"class_label", "room"}
    enrollment_fields = {"progress_percent", "current_week", "featured"}
    known = catalog_fields | offering_fields | enrollment_fields
    if "tutor" in changes or "lecturer" in changes or "weeks" in changes:
        known |= {"tutor", "lecturer", "weeks"}
    unknown = set(changes) - known
    if unknown:
        # Guard terhadap field yang salah ketik di schema nanti — lebih baik
        # gagal_now daripada diam-diam mengabaikan.
        raise Conflict(f"Field tidak dikenal: {', '.join(sorted(unknown))}.")

    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    offering = (
        await db.execute(select(CourseOffering).where(CourseOffering.id == offering_id))
    ).scalar_one()
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.offering_id == offering_id,
                Enrollment.user_id == user_id,
            )
        )
    ).scalar_one()

    if catalog_fields & set(changes):
        new_code = (changes.get("code") or course.code).strip()
        clash = (
            await db.execute(
                select(Course).where(Course.code == new_code, Course.id != course_id)
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise Conflict(f"Kode matkul {new_code} sudah dipakai.")
        for field in catalog_fields:
            if field in changes:
                setattr(course, field, changes[field])

    for field in offering_fields:
        if field in changes:
            setattr(offering, field, changes[field])
    for field in enrollment_fields:
        if field in changes:
            setattr(enrollment, field, changes[field])

    if changes.get("lecturer") is not None:
        lecturer_id = await _upsert_lecturer(db, changes["lecturer"])
        link = (
            await db.execute(
                select(OfferingLecturer).where(
                    OfferingLecturer.offering_id == offering_id,
                    OfferingLecturer.is_primary.is_(True),
                )
            )
        ).scalar_one_or_none()
        if link is None:
            db.add(
                OfferingLecturer(
                    offering_id=offering_id,
                    lecturer_id=lecturer_id,
                    role="utama",
                    is_primary=True,
                )
            )
        else:
            link.lecturer_id = lecturer_id

    if "tutor" in changes:
        if changes["tutor"] is None:
            # Melepas tutor = menghapus sandbox RAG-nya. `rag_isolation` di
            # metric ikut turun — itu memang konsekuensi yang benar.
            await db.execute(
                delete(CourseTutor).where(CourseTutor.offering_id == offering_id)
            )
        else:
            tutor_id = await _upsert_tutor(db, changes["tutor"])
            link = (
                await db.execute(
                    select(CourseTutor).where(
                        CourseTutor.offering_id == offering_id,
                        CourseTutor.is_primary.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if link is None:
                db.add(
                    CourseTutor(
                        offering_id=offering_id,
                        tutor_id=tutor_id,
                        rag_namespace=f"course-{offering_id}",
                        is_primary=True,
                        temperature=0.3,
                    )
                )
            else:
                link.tutor_id = tutor_id

    if changes.get("weeks"):
        # `changes` berasal dari `payload.model_dump()`, jadi isinya sudah dict
        # — bukan objek Pydantic. `_apply_weeks` memang membaca dict, jadi
        # jangan memanggil `.model_dump()` di sini.
        await _apply_weeks(db, offering_id, changes["weeks"])

    await db.commit()
    return await _card_for(db, course_id, user_id=user_id)


async def drop_enrollment(
    db: AsyncSession, course_id: str, *, user_id: str = DEFAULT_USER
) -> None:
    """Lepas matkul dari semester: `enrollments.status` jadi `'dropped'`.

    Soft delete. Kartu hilang dari daftar karena semua query memfilter
    `status = 'aktif'`, tapi barisnya tetap ada bersama materi, minggu, dan
    dosen — jadi `restore_enrollment` bisa mengembalikannya.

    Offering-nya sendiri tidak dihapus: kalau offering ikut terhapus, materi dan
    minggu ikut hilang lewat CASCADE dan ini berhenti bisa dibatalkan.
    """
    offering_id = await _offering_id_for(
        db, course_id, user_id=user_id, statuses=("aktif", "dropped")
    )
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.offering_id == offering_id,
                Enrollment.user_id == user_id,
            )
        )
    ).scalar_one()
    if enrollment.status == "dropped":
        raise Conflict("Mata kuliah ini sudah dilepas dari semester.")
    enrollment.status = "dropped"
    await db.commit()


async def restore_enrollment(
    db: AsyncSession, course_id: str, *, user_id: str = DEFAULT_USER
) -> CourseCardOut:
    """Kembalikan matkul yang sebelumnya di-soft-delete.

    Offering harus masih milik semester aktif. Kalau semesternya sudah berganti,
    menghidupkan enrollment lama tidak benar: enrollment itu menyimpan history
    satu semester, dan offering-nya masih tertaut ke term yang lampau.
    """
    # `statuses` harus memuat "aktif" juga, bukan hanya "dropped". Kalau hanya
    # "dropped", `_offering_id_for` akan menolak course yang sedang aktif dan
    # melempar `NotFound` — guard di bawah tidak akan pernah tercapai, dan
    # pengguna mendapat 404 yang membingungkan untuk permintaan yang sebenarnya
    # konflik (409).
    offering_id = await _offering_id_for(
        db,
        course_id,
        user_id=user_id,
        statuses=("dropped", "aktif"),
        require_active_term=False,
    )
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.offering_id == offering_id,
                Enrollment.user_id == user_id,
            )
        )
    ).scalar_one()
    if enrollment.status != "dropped":
        raise Conflict("Mata kuliah ini sedang aktif — tidak perlu dipulihkan.")

    offering = (
        await db.execute(select(CourseOffering).where(CourseOffering.id == offering_id))
    ).scalar_one()
    term_active = (
        await db.execute(select(Term.is_active).where(Term.id == offering.term_id))
    ).scalar_one()
    if not term_active:
        label = (
            await db.execute(select(Term.label).where(Term.id == offering.term_id))
        ).scalar_one_or_none()
        raise Conflict(
            f"Semester {label or 'lama'} sudah selesai. "
            "Daftarkan ulang matkul ini di semester berjalan."
        )
    enrollment.status = "aktif"
    await db.commit()
    return await _card_for(db, course_id, user_id=user_id)


async def create_tutor_session(
    db: AsyncSession,
    course_id: str,
    *,
    user_id: str = DEFAULT_USER,
    session_id: str | None = None,
    message: str | None = None,
) -> TutorSessionOut:
    """Buat (atau pakai ulang) sesi chat yang di-scope ke satu matkul.

    Sesi yang di-scope ini yang membuat klaim "isolasi konteks RAG" bisa
    ditegakkan: `chat_sessions.offering_id` dibaca saat retrieval, jadi jawaban
    tutor tidak bisa menarik materi matkul lain.
    """
    offering_id = await _offering_id_for(db, course_id, user_id=user_id)
    tutor_row = (
        await db.execute(
            select(AiTutor, CourseTutor.rag_namespace)
            .join(CourseTutor, CourseTutor.tutor_id == AiTutor.id)
            .where(
                CourseTutor.offering_id == offering_id,
                CourseTutor.is_primary.is_(True),
            )
        )
    ).first()
    if tutor_row is None:
        raise NotFound("Mata kuliah ini belum punya AI tutor.")
    tutor, namespace = tutor_row

    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one()

    new_session_id = session_id or f"course-{course_id}-{offering_id}"
    existing = await db.get(ChatSession, new_session_id)
    if existing is None:
        db.add(
            ChatSession(
                id=new_session_id,
                user_id=user_id,
                title=f"Tanya {tutor.name} - {course.title}",
                offering_id=offering_id,
                tutor_id=tutor.id,
            )
        )
        await db.commit()
    else:
        # Sesi lama dibuat sebelum fitur ini: lengkapi scopenya sekarang.
        if existing.offering_id is None:
            existing.offering_id = offering_id
            existing.tutor_id = tutor.id
            await db.commit()

    opening = message or (
        f"Tanya \"{tutor.name}\" tentang \"{course.title}\" ({course.code}): "
    )
    return TutorSessionOut(
        session_id=new_session_id,
        tutor_id=tutor.id,
        tutor_name=tutor.name,
        rag_namespace=namespace or "",
        opening_prompt=opening,
    )


# ---------------------------------------------------------------------------
# Materi (dipakai FilesPage & kartu matkul)
# ---------------------------------------------------------------------------
_EXT_BY_KIND = {
    "pdf": "pdf", "docx": "docx", "csv": "csv", "xlsx": "xlsx",
    "txt": "txt", "md": "md", "link": "link",
}


def guess_kind(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in ("xls",):
        return "xlsx"
    if ext in ("json",):
        return "txt"
    if ext in _EXT_BY_KIND:
        return ext
    return "docx"


_FALLBACK_ASSISTANT = ("Orbita", "secondary")


def _material_to_out(row) -> MaterialOut:
    tutor_name, tone = _FALLBACK_ASSISTANT
    if row.tutor_name:
        tutor_name = row.tutor_name
        tone = row.tutor_tone or "secondary"
    status = row.status
    return MaterialOut(
        id=row.id,
        name=row.name,
        sub=row.derived_note or row.source_label or "",
        kind=row.kind,
        size_label=size_label(row.size_mb),  # type: ignore[arg-type]
        size_mb=row.size_mb,
        modified=modified_label(row.updated_at),
        modified_ts=(row.updated_at or _utcnow()).timestamp(),
        status=status,
        # `progress` hanya bermakna saat sedang diproses — sama seperti mock lama.
        progress=int(row.index_progress) if status == "indexing" else None,
        assistant=MaterialAssistant(
            initial=initial_of(tutor_name), name=tutor_name, tone=tone  # type: ignore[arg-type]
        ),
        course_id=row.course_id,
        course_title=row.course_title,
        access_level=row.access_level,
    )


_MATERIAL_COLUMNS = (
    CourseMaterial.id,
    CourseMaterial.name,
    CourseMaterial.kind,
    CourseMaterial.source_label,
    CourseMaterial.derived_note,
    CourseMaterial.size_mb,
    CourseMaterial.status,
    CourseMaterial.index_progress,
    CourseMaterial.access_level,
    CourseMaterial.updated_at,
    Course.id.label("course_id"),
    Course.title.label("course_title"),
    AiTutor.name.label("tutor_name"),
    AiTutor.avatar_tone.label("tutor_tone"),
)

_FILES_SORT = {
    "name": lambda: CourseMaterial.name.asc(),
    "size": lambda: CourseMaterial.size_mb.desc(),
    "recent": lambda: CourseMaterial.updated_at.desc(),
}


def _material_from():
    """FROM + join standar untuk query materi.

    `course_materials.offering_id` menunjuk `course_offerings.id`, BUKAN
    `courses.id`. Join harus lewat `course_offerings`. Menulis
    `ON course_materials.offering_id = courses.id` lolos tanpa error dan
    diam-diam selalu menghasilkan nol baris — persis bug yang pernah terjadi.
    """
    return (
        CourseMaterial.__table__,
        [
            (CourseOffering, and_(CourseMaterial.offering_id == CourseOffering.id), True),
            (Course, and_(CourseOffering.course_id == Course.id), True),
            (AiTutor, and_(CourseMaterial.tutor_id == AiTutor.id), True),
        ],
    )


def _apply_joins(stmt, joins):
    for target, on, outer in joins:
        stmt = stmt.join(target, on, isouter=outer)
    return stmt


async def list_materials(
    db: AsyncSession,
    *,
    tab: str = "all",
    kind: str = "all",
    q: str = "",
    course_id: str | None = None,
    folder_id: str | None = None,
    sort: str = "recent",
    limit: int = 50,
    offset: int = 0,
) -> MaterialListOut:
    """Daftar file untuk FilesPage. Semua filter & sort terjadi di database."""
    source, joins = _material_from()
    stmt = _apply_joins(select(*_MATERIAL_COLUMNS).select_from(source), joins)
    stmt = _apply_material_filters(
        stmt, tab=tab, kind=kind, q=q, course_id=course_id, folder_id=folder_id
    )
    total = (
        await db.execute(
            _apply_material_filters(
                _apply_joins(select(func.count()).select_from(source), joins),
                tab=tab, kind=kind, q=q, course_id=course_id, folder_id=folder_id,
            )
        )
    ).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(*(_FILES_SORT.get(sort, _FILES_SORT["recent"])(),))
            .limit(max(1, min(limit, 200)))
            .offset(max(offset, 0))
        )
    ).all()
    return MaterialListOut(
        total=int(total),
        items=[_material_to_out(r) for r in rows],
        stats=await _fetch_material_stats(db, course_id=course_id),
    )


def _apply_material_filters(
    stmt: Select,
    *,
    tab: str,
    kind: str,
    q: str,
    course_id: str | None,
    folder_id: str | None = None,
) -> Select:
    if tab == "recent":
        cutoff = _utcnow() - timedelta(days=RECENT_DAYS)
        stmt = stmt.where(CourseMaterial.updated_at >= cutoff)
    elif tab == "shared":
        # Dipertahankan dari perilaku lama (docx/xlsx) supaya isi tab tidak
        # berubah. `access_level` sebenarnya lebih tepat untuk "Shared", tapi
        # memakainya akan mengubah file mana yang terlihat — keputusan produk.
        stmt = stmt.where(CourseMaterial.kind.in_(("docx", "xlsx")))
    elif tab == "trash":
        # Soft delete belum dimodelkan, jadi Trash memang kosong — sama seperti
        # sebelumnya di frontend. `false()` (bukan `func.null()`) yang menghasilkan
        # `WHERE 0 = 1`; `WHERE null()` error sintaks di SQLite.
        stmt = stmt.where(false())
    if kind != "all":
        stmt = stmt.where(CourseMaterial.kind == kind)
    if course_id:
        stmt = stmt.where(Course.id == course_id)
    if folder_id:
        stmt = stmt.where(CourseMaterial.folder_id == folder_id)
    if q:
        needle = f"%{_escape_like(q.strip().lower())}%"
        stmt = stmt.where(
            or_(
                func.lower(CourseMaterial.name).like(needle, escape="\\"),
                func.lower(CourseMaterial.derived_note).like(needle, escape="\\"),
                func.lower(AiTutor.name).like(needle, escape="\\"),
                func.lower(CourseMaterial.kind).like(needle, escape="\\"),
            )
        )
    return stmt


async def _fetch_material_stats(
    db: AsyncSession, *, course_id: str | None
) -> MaterialStats:
    source, joins = _material_from()
    stmt = _apply_joins(
        select(
            func.count().label("total"),
            func.coalesce(
                func.sum(case((CourseMaterial.status.in_(("indexed", "ready")), 1), else_=0)),
                0,
            ).label("indexed"),
            func.coalesce(
                func.sum(case((CourseMaterial.status == "indexing", 1), else_=0)), 0
            ).label("indexing"),
            func.coalesce(func.sum(CourseMaterial.chunk_count), 0).label("chunks"),
            func.coalesce(func.sum(CourseMaterial.size_mb), 0.0).label("size"),
        ).select_from(source),
        joins,
    )
    if course_id:
        stmt = stmt.where(Course.id == course_id)
    row = (await db.execute(stmt)).one()
    return MaterialStats(
        total=int(row.total),
        indexed=int(row.indexed),
        indexing=int(row.indexing),
        total_chunks=int(row.chunks),
        total_size_mb=round(float(row.size), 1),
    )


async def create_materials(
    db: AsyncSession, specs: list[dict], *, prefix: str = "upload"
) -> list[MaterialOut]:
    """Catat file hasil dropzone. Hanya metadata; byte-nya belum diproses."""
    created: list[CourseMaterial] = []
    for spec in specs:
        name = spec["name"]
        kind = spec.get("kind") or guess_kind(name)
        row = CourseMaterial(
            # `uuid4`, bukan `timestamp():.0f`. Versi sebelumnya memakai detik
            # sebagai penanda unik, jadi dua upload dalam 1 detik menghasilkan
            # primary key yang sama persis -> IntegrityError -> 500. Unlikely,
            # tapi salah dan tidak sulit dihindari.
            id=f"mat-{prefix}-{uuid4().hex[:12]}",
            offering_id=spec.get("offering_id"),
            folder_id=spec.get("folder_id"),
            tutor_id=spec.get("tutor_id"),
            name=name,
            kind=kind,
            source_label=spec.get("source_label") or "Upload lokal",
            derived_note=spec.get("derived_note") or "Queued for study indexing",
            size_mb=float(spec.get("size_mb") or 0.0),
            status="indexing",
            index_progress=int(spec.get("index_progress") or 5),
            access_level=spec.get("access_level") or "student",
            chunk_count=0,
        )
        created.append(row)
        db.add(row)
    await db.commit()

    # Ambil balik HANYA baris yang baru dibuat, lewat `IN (id)`.
    #
    # Versi sebelumnya mengambil `list_materials(sort="recent", limit=n+5)` lalu
    # menyaring hasilnya. Itu rapuh: `updated_at` SQLite berpresisi detik, jadi
    # semua file yang masuk dalam 1 detik punya `updated_at` identik dan
    # `ORDER BY updated_at DESC` tidak menentukan urutannya. Akibatnya beberapa
    # file baru jatuh di luar jendela dan tidak pernah dikembalikan —
    # frontend lalu mengira upload gagal, dan loop status indexing-nya tidak
    # pernah jalan untuk file itu.
    wanted = [row.id for row in created]
    source, joins = _material_from()
    rows = (
        await db.execute(
            _apply_joins(
                select(*_MATERIAL_COLUMNS).select_from(source), joins
            ).where(CourseMaterial.id.in_(wanted))
        )
    ).all()
    by_id = {r.id: r for r in rows}
    # Urutan mengikuti urutan input (urutan file di dropzone), bukan urutan query.
    return [_material_to_out(by_id[i]) for i in wanted if i in by_id]


async def _require_folder(db: AsyncSession, folder_id: str) -> MaterialFolder:
    folder = (
        await db.execute(select(MaterialFolder).where(MaterialFolder.id == folder_id))
    ).scalar_one_or_none()
    if folder is None:
        raise NotFound(f"Folder {folder_id} tidak ditemukan.")
    return folder


async def _resolve_folder_offering(
    db: AsyncSession, offering_id: str | None, course_id: str | None
) -> str | None:
    """Offering untuk scope folder: langsung, via course aktif, atau global.

    Validasi offering di sini supaya create & update berbagi satu jalur.
    """
    if offering_id is None and course_id:
        offering_id = (
            await db.execute(
                select(CourseOffering.id)
                .join(Term, CourseOffering.term_id == Term.id)
                .where(
                    CourseOffering.course_id == course_id,
                    Term.is_active.is_(True),
                )
                .order_by(CourseOffering.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if offering_id is None:
            raise NotFound("Mata kuliah tidak punya offering di semester aktif.")
    if offering_id is not None:
        offering_exists = (
            await db.execute(
                select(CourseOffering.id).where(CourseOffering.id == offering_id)
            )
        ).scalar_one_or_none()
        if offering_exists is None:
            raise NotFound(f"Offering {offering_id} tidak ditemukan.")
    return offering_id


async def _folder_name_clash(
    db: AsyncSession, name: str, offering_id: str | None, *, exclude_id: str | None = None
) -> bool:
    """True kalau nama sudah dipakai di scope yang sama.

    NULL tidak bisa ikut UNIQUE constraint (`NULL != NULL`), jadi dicek
    manual — dipakai create & rename supaya aturannya satu.
    """
    scope = (
        MaterialFolder.offering_id.is_(None)
        if offering_id is None
        else MaterialFolder.offering_id == offering_id
    )
    conds = [MaterialFolder.name == name, scope]
    if exclude_id is not None:
        conds.append(MaterialFolder.id != exclude_id)
    clash = (
        await db.execute(select(MaterialFolder.id).where(*conds))
    ).scalar_one_or_none()
    return clash is not None


async def _folder_out_for(db: AsyncSession, folder_id: str) -> FolderOut:
    """Satu FolderOut lewat mapper yang sama dengan `list_folders`."""
    listing = await list_folders(db)
    card = next((f for f in listing.folders if f.id == folder_id), None)
    if card is None:  # pragma: no cover — baru dibuat, pasti ada.
        raise NotFound(f"Folder {folder_id} tidak ditemukan.")
    return card


async def update_folder(
    db: AsyncSession,
    folder_id: str,
    *,
    name: str | None = None,
    icon: str | None = None,
) -> FolderOut:
    """Rename / ganti ikon folder. Nama unik per scope (kecuali diri sendiri)."""
    folder = await _require_folder(db, folder_id)
    if name is not None:
        clean = (name or "").strip()
        if not clean:
            raise Conflict("Nama folder wajib diisi.")
        if clean != folder.name and await _folder_name_clash(
            db, clean, folder.offering_id, exclude_id=folder.id
        ):
            raise Conflict(f'Folder "{clean}" sudah ada.')
        folder.name = clean
    if icon is not None:
        folder.icon = icon
    await db.commit()
    return await _folder_out_for(db, folder.id)


async def delete_folder(db: AsyncSession, folder_id: str) -> tuple[int, int]:
    """Hapus folder; isi jadi file lepas. Return (deleted, released).

    `folder_id` di materi di-NULL-kan eksplisit di sini, bukan mengandalkan
    `ondelete="SET NULL"` di database — SQLite hanya menjalankannya kalau
    `PRAGMA foreign_keys=ON`, dan service tidak boleh bergantung pada itu.
    """
    folder = await _require_folder(db, folder_id)
    released = (
        await db.execute(
            select(func.count())
            .select_from(CourseMaterial)
            .where(CourseMaterial.folder_id == folder.id)
        )
    ).scalar_one()
    await db.execute(
        update(CourseMaterial)
        .where(CourseMaterial.folder_id == folder.id)
        .values(folder_id=None)
    )
    await db.delete(folder)
    await db.commit()
    return 1, int(released)


async def create_folder(
    db: AsyncSession,
    *,
    name: str,
    icon: str = "folder",
    badge_tone: str = "rag",
    badge_label: str | None = None,
    offering_id: str | None = None,
    course_id: str | None = None,
) -> FolderOut:
    """Buat folder virtual baru. Nama unik per scope (global vs satu offering).

    NULL tidak bisa ikut UNIQUE constraint (`NULL != NULL`), jadi duplikat
    dicek di sini dan dipetakan router ke 409 — sesuai keputusan produk.
    `course_id` (Course.id) di-resolve ke offering semester aktif, sama
    seperti upload; `offering_id` langsung dipakai kalau diberikan.
    """
    clean = (name or "").strip()
    if not clean:
        raise Conflict("Nama folder wajib diisi.")
    offering_id = await _resolve_folder_offering(db, offering_id, course_id)
    if await _folder_name_clash(db, clean, offering_id):
        raise Conflict(f'Folder "{clean}" sudah ada.')

    top = (
        await db.execute(select(func.coalesce(func.max(MaterialFolder.sort_order), -1)))
    ).scalar_one()
    folder = MaterialFolder(
        id=f"fld-{slug(clean)}-{uuid4().hex[:6]}",
        name=clean,
        badge_label=(badge_label or "").strip() or clean,
        badge_tone=badge_tone,
        icon=icon,
        offering_id=offering_id,
        sort_order=int(top) + 1,
    )
    db.add(folder)
    await db.commit()
    return FolderOut(
        id=folder.id,
        name=folder.name,
        count="0 files",
        size="0 MB",
        updated="",
        badge=FolderBadge(label=folder.badge_label, tone=folder.badge_tone),  # type: ignore[arg-type]
        icon=folder.icon,  # type: ignore[arg-type]
    )


async def update_material(
    db: AsyncSession, material_id: str, changes: dict
) -> MaterialOut:
    row = await db.get(CourseMaterial, material_id)
    if row is None:
        raise NotFound("Berkas tidak ditemukan.")
    for key in ("status", "index_progress", "chunk_count", "derived_note"):
        if changes.get(key) is not None:
            setattr(row, key, changes[key])
    if changes.get("name") is not None:
        clean = (changes["name"] or "").strip()
        if not clean:
            raise Conflict("Nama berkas wajib diisi.")
        row.name = clean[:255]
    # `folder_id` dibaca dengan `in`, bukan `.get() is not None`: dikirim
    # `null` berarti keluarkan dari folder — itu nilai yang sah.
    if "folder_id" in changes:
        folder_id = changes["folder_id"]
        if folder_id is not None:
            await _require_folder(db, folder_id)
        row.folder_id = folder_id
    if row.status in ("indexed", "ready"):
        row.indexed_at = _utcnow()
        if row.index_progress == 100 and row.status == "indexed":
            row.derived_note = row.derived_note or "Ready - searchable in Course Materials"
    await db.commit()
    await db.refresh(row)
    source, joins = _material_from()
    stmt = _apply_joins(
        select(*_MATERIAL_COLUMNS).select_from(source), joins
    ).where(CourseMaterial.id == material_id)
    return _material_to_out((await db.execute(stmt)).one())


async def delete_material(db: AsyncSession, material_id: str) -> bool:
    """Hapus berkas permanen: baris + chunks (CASCADE) + byte di disk.

    File disk dihapus best-effort SETELAH commit: gagal hapus disk hanya
    dicatat di log, tidak menggagalkan request — barisnya sudah hilang dan
    mengulang DELETE akan 404.
    """
    from pathlib import Path

    row = await db.get(CourseMaterial, material_id)
    if row is None:
        return False
    storage_path = row.storage_path
    await db.delete(row)
    await db.commit()
    if storage_path:
        try:
            Path(storage_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Gagal menghapus byte %s", storage_path, exc_info=True)
    return True


async def list_folders(db: AsyncSession) -> FolderListOut:
    """Folder untuk PinnedFolders. Angka dihitung dari course_materials."""
    rows = (
        await db.execute(
            select(
                MaterialFolder.id,
                MaterialFolder.name,
                MaterialFolder.badge_label,
                MaterialFolder.badge_tone,
                MaterialFolder.icon,
                func.count(CourseMaterial.id).label("files"),
                func.coalesce(func.sum(CourseMaterial.size_mb), 0.0).label("size"),
                func.max(CourseMaterial.updated_at).label("updated"),
            )
            .select_from(MaterialFolder)
            .outerjoin(CourseMaterial, CourseMaterial.folder_id == MaterialFolder.id)
            .group_by(
                MaterialFolder.id,
                MaterialFolder.name,
                MaterialFolder.badge_label,
                MaterialFolder.badge_tone,
                MaterialFolder.icon,
                MaterialFolder.sort_order,
            )
            .order_by(MaterialFolder.sort_order)
        )
    ).all()
    return FolderListOut(
        folders=[
            FolderOut(
                id=r.id,
                name=r.name,
                count=f"{int(r.files)} files" if int(r.files) != 1 else "1 file",
                size=total_size_label(float(r.size)),
                updated=ago_label(r.updated),
                badge=FolderBadge(label=r.badge_label, tone=r.badge_tone),  # type: ignore[arg-type]
                icon=r.icon,  # type: ignore[arg-type]
            )
            for r in rows
        ]
    )


async def course_offering_ids(
    db: AsyncSession, course_id: str
) -> tuple[str, str, list[str]]:
    """(course_id, title, [offering_id]) — untuk filter FilesPage per matkul."""
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one_or_none()
    if course is None:
        raise NotFound("Mata kuliah tidak ditemukan.")
    offering_ids = list(
        (
            await db.execute(
                select(CourseOffering.id).where(CourseOffering.course_id == course_id)
            )
        ).scalars().all()
    )
    return course.id, course.title, offering_ids


async def create_materials_upload(
    db: AsyncSession,
    files: list[tuple[str, bytes]],
    *,
    offering_id: str | None = None,
    course_id: str | None = None,
    folder_id: str | None = None,
    access_level: str = "student",
) -> list[MaterialOut]:
    """Simpan byte upload ke disk + catat row `queued` untuk ingest.

    - `files`: [(filename, bytes)]. Tanpa batas ukuran kaku (sesuai keputusan
      user): `size_mb` dicatat apa adanya.
    - `course_id` (Course.id dari filter FilesPage) di-resolve ke offering
      semester aktif; `offering_id` langsung dipakai kalau diberikan.
    - `folder_id` opsional: file baru langsung masuk folder itu (dipakai saat
      user mengunggah dari dalam tampilan folder). `None` = file lepas.
    - File ditulis ke `settings.storage_dir/<material_id>_<safe_name>`,
      `storage_path` diisi, status awal `queued`. Router menjadwalkan
      `ingest_service.run_ingest` sebagai BackgroundTasks.
    """
    from pathlib import Path

    from backend.services.ingest_service import ensure_storage_dir, safe_filename

    resolved_offering = offering_id
    if resolved_offering is None and course_id:
        resolved_offering = (
            await db.execute(
                select(CourseOffering.id)
                .join(Term, CourseOffering.term_id == Term.id)
                .where(
                    CourseOffering.course_id == course_id,
                    Term.is_active.is_(True),
                )
                .order_by(CourseOffering.id)
                .limit(1)
            )
        ).scalar_one_or_none()
    if resolved_offering is not None:
        exists = (
            await db.execute(
                select(CourseOffering.id).where(
                    CourseOffering.id == resolved_offering
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            raise NotFound("Offering untuk materi tidak ditemukan.")
    if folder_id is not None:
        await _require_folder(db, folder_id)

    storage = ensure_storage_dir()
    created_ids: list[str] = []
    for filename, data in files:
        name = filename.strip() or "upload.bin"
        kind = guess_kind(name)
        material_id = f"mat-upload-{uuid4().hex[:12]}"
        dest = Path(storage) / f"{material_id}_{safe_filename(name)}"
        dest.write_bytes(data)
        db.add(
            CourseMaterial(
                id=material_id,
                offering_id=resolved_offering,
                folder_id=folder_id,
                tutor_id=None,
                name=name[:255],
                kind=kind,
                source_label="Upload lokal",
                derived_note="Queued for study indexing",
                size_mb=round(len(data) / (1024 * 1024), 2),
                storage_path=str(dest),
                status="queued",
                index_progress=0,
                access_level=access_level or "student",
                chunk_count=0,
            )
        )
        created_ids.append(material_id)
    await db.commit()

    source, joins = _material_from()
    rows = (
        await db.execute(
            _apply_joins(
                select(*_MATERIAL_COLUMNS).select_from(source), joins
            ).where(CourseMaterial.id.in_(created_ids))
        )
    ).all()
    by_id = {r.id: r for r in rows}
    return [_material_to_out(by_id[i]) for i in created_ids if i in by_id]


__all__ = [
    "Conflict",
    "NotFound",
    "ago_label",
    "consult_label",
    "create_folder",
    "create_materials",
    "create_materials_upload",
    "create_tutor_session",
    "delete_folder",
    "delete_material",
    "update_folder",
    "get_course_detail",
    "initial_of",
    "list_courses",
    "list_folders",
    "list_materials",
    "modified_label",
    "size_label",
    "total_size_label",
    "update_material",
    "update_progress",
    "week_label",
    "COUNTED_MATERIAL_STATUSES",
    "PROGRESS_BEHIND",
]
