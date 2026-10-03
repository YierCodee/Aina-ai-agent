"""Isi awal tabel matkul dari data contoh yang sebelumnya ada di frontend.

Data inidulur dari `src/data/courses.ts` (`INITIAL_COURSES`) dan
`src/data/files.ts` (`INITIAL_FILES`) sebelum keduanya dipindah ke database.
Setelah migrasi, kedua file frontend itu hanya tipe + konstanta UI.

Yang perlu diperhatikan:
- `rag_files` / `rag_chunks` TIDAK disimpan. Seed membuat baris `course_materials`
  sungguhan dengan jumlahnya persis seperti angka lama, supaya angka di UI tidak
  berubah saat pindah ke database.
- `initial` (avatar) dan class warna tidak disimpan. `initial` diturunkan dari
  nama, warna disimpan sebagai token (`avatar_tone`).
- Jadwal konsultasi yang tadinya satu string dipecah jadi satu baris per hari,
  supaya bisa di-query.
- Seed idempoten: kalau `courses` sudah berisi baris, fungsi ini tidak
  melakukan apa-apa dan mengembalikan False.
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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

logger = logging.getLogger(__name__)

USER_ID = "mahasiswa"
TERM_ID = "2025-1"
TERM_LABEL = "Semester Gasal 2025/2026"
ACADEMIC_YEAR = "2025/2026"
SEMESTER_NO = 1
TOTAL_WEEKS = 14

# (kode, hari_1based, jam_mulai, jam_selesai)
DAY_SENIN, DAY_SELASA, DAY_RABU, DAY_KAMIS, DAY_JUMAT = 1, 2, 3, 4, 5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _t(hour: int, minute: int = 0) -> time:
    return time(hour, minute)


# key = id course, dipakai baris seed di bawah
SEED_COURSES: list[dict] = [
    {
        "id": "c-matdis",
        "code": "IF-201",
        "title": "Matematika Diskrit",
        "sks": 3,
        "kind": "teori",
        "focus": "Logika, Himpunan, Relasi, Graf & Kombinatorik",
        "class_label": "Kelas A (R. 301)",
        "room": "R. 301",
        "progress": 65,
        "current_week": 8,
        "featured": False,
        "rag_files": 32,
        "rag_chunks": 48,
        "lecturer": {
            "id": "lec-matdis",
            "email": "budi.hartono@kampus.ac.id",
            "name": "Dr. Ir. Budi Hartono, M.Kom.",
            "tone": "secondary",
            "slots": [(DAY_SELASA, _t(13), _t(15)), (DAY_KAMIS, _t(13), _t(15))],
        },
        "tutor": {
            "id": "tut-matdis",
            "name": "DiscreteMath AI",
            "desc": "Hanya menjawab berbasis slide & silabus, zero hallucination.",
            "emoji": "🤖",
        },
    },
    {
        "id": "c-strukdat",
        "code": "IF-202",
        "title": "Struktur Data",
        "sks": 3,
        "kind": "teori",
        "focus": "Array, Linked List, Tree, Graph, Hashing & Sorting",
        "class_label": "Kelas B (R. 302)",
        "room": "R. 302",
        "progress": 72,
        "current_week": 9,
        "featured": True,
        "rag_files": 54,
        "rag_chunks": 86,
        "lecturer": {
            "id": "lec-strukdat",
            "email": "siti.rahmawati@kampus.ac.id",
            "name": "Prof. Siti Rahmawati, Ph.D.",
            "tone": "success-emerald",
            "slots": [(DAY_SENIN, _t(10), _t(12))],
        },
        "tutor": {
            "id": "tut-strukdat",
            "name": "StructData AI",
            "desc": "Solver kompleksitas + visualisasi struktur data step-by-step.",
            "emoji": "🧠",
        },
    },
    {
        "id": "c-os",
        "code": "IF-203",
        "title": "Sistem Operasi",
        "sks": 3,
        "kind": "teori",
        "focus": "Proses, Thread, Scheduling, Memori & File System",
        "class_label": "Kelas A (Lab OS)",
        "room": "Lab OS",
        "progress": 58,
        "current_week": 7,
        "featured": False,
        "rag_files": 28,
        "rag_chunks": 36,
        "lecturer": {
            "id": "lec-os",
            "email": "ahmad.fauzi@kampus.ac.id",
            "name": "Ahmad Fauzi, S.Kom., M.T.",
            "tone": "tertiary-container",
            "slots": [(DAY_RABU, _t(14), _t(16))],
        },
        "tutor": {
            "id": "tut-os",
            "name": "OS Copilot",
            "desc": "Pakar scheduling, paging & studi kasus Linux kernel.",
            "emoji": "🗄️",
        },
    },
    {
        "id": "c-pweb",
        "code": "IF-204",
        "title": "Pemrograman Web",
        "sks": 3,
        "kind": "teori",
        "focus": "HTML, CSS, JavaScript, React & REST API",
        "class_label": "Kelas C (R. 303)",
        "room": "R. 303",
        "progress": 60,
        "current_week": 8,
        "featured": False,
        "rag_files": 24,
        "rag_chunks": 32,
        "lecturer": {
            "id": "lec-pweb",
            "email": "dian.paramitha@kampus.ac.id",
            "name": "Dian Paramitha, S.T., M.Sc.",
            "tone": "primary-container",
            "slots": [(DAY_JUMAT, _t(9), _t(11, 30))],
        },
        "tutor": {
            "id": "tut-pweb",
            "name": "WebMentor AI",
            "desc": "Review kode frontend, aksesibilitas & best practice.",
            "emoji": "🏛️",
        },
    },
    {
        "id": "c-prak-pweb",
        "code": "IF-204P",
        "title": "Praktikum Pemrograman Web",
        "sks": 1,
        "kind": "praktikum",
        "focus": "Praktik layout, form, fetch API & deploy",
        "class_label": "Lab Web (R. 305)",
        "room": "R. 305",
        "progress": 70,
        "current_week": 8,
        "featured": False,
        "rag_files": 18,
        "rag_chunks": 26,
        "lecturer": {
            "id": "lec-prak-pweb",
            "email": "asisten.labweb@kampus.ac.id",
            "name": "Asisten Lab Web",
            "tone": "secondary",
            "slots": [(DAY_KAMIS, _t(13), _t(15))],
        },
        "tutor": {
            "id": "tut-prak-pweb",
            "name": "WebLab AI",
            "desc": "Debug error browser & review tugas praktikum.",
            "emoji": "🧪",
        },
    },
    {
        "id": "c-pbo",
        "code": "IF-205",
        "title": "Pemrograman Berorientasi Objek",
        "sks": 3,
        "kind": "teori",
        "focus": "Class, Inheritance, Polymorphism, SOLID & UML",
        "class_label": "Kelas D (R. 304)",
        "room": "R. 304",
        "progress": 55,
        "current_week": 7,
        "featured": False,
        "rag_files": 26,
        "rag_chunks": 34,
        "lecturer": {
            "id": "lec-pbo",
            "email": "rina.wulandari@kampus.ac.id",
            "name": "Rina Wulandari, S.Kom., M.T.",
            "tone": "surface-tint",
            "slots": [(DAY_SELASA, _t(10), _t(12))],
        },
        "tutor": {
            "id": "tut-pbo",
            "name": "OOP Mentor",
            "desc": "Review diagram UML & clean code berbasis studi kasus.",
            "emoji": "🧩",
        },
    },
    {
        "id": "c-prak-alpro",
        "code": "IF-101P",
        "title": "Praktikum Algoritma Pemrograman",
        "sks": 1,
        "kind": "praktikum",
        "focus": "Looping, Array, Fungsi, Rekursi & Sorting dasar",
        "class_label": "Lab Algo (R. 306)",
        "room": "R. 306",
        "progress": 80,
        "current_week": 8,
        "featured": False,
        "rag_files": 20,
        "rag_chunks": 30,
        "lecturer": {
            "id": "lec-prak-alpro",
            "email": "asisten.labalgo@kampus.ac.id",
            "name": "Asisten Lab Algo",
            "tone": "secondary",
            "slots": [(DAY_SENIN, _t(13), _t(15))],
        },
        "tutor": {
            "id": "tut-prak-alpro",
            "name": "AlgoTutor AI",
            "desc": "Bedah alur program & trace tabel untuk tiap modul.",
            "emoji": "⚡",
        },
    },
    {
        "id": "c-jarkom",
        "code": "IF-206",
        "title": "Jaringan Komputer",
        "sks": 3,
        "kind": "teori",
        "focus": "OSI, TCP/IP, Subnetting, Routing & DNS",
        "class_label": "Kelas B (Lab Jarkom)",
        "room": "Lab Jarkom",
        "progress": 50,
        "current_week": 7,
        "featured": False,
        "rag_files": 22,
        "rag_chunks": 28,
        "lecturer": {
            "id": "lec-jarkom",
            "email": "hendra.gunawan@kampus.ac.id",
            "name": "Hendra Gunawan, S.T., M.Kom.",
            "tone": "surface-dark",
            "slots": [(DAY_RABU, _t(9), _t(11))],
        },
        "tutor": {
            "id": "tut-jarkom",
            "name": "NetBot",
            "desc": "Simulasi subnet & troubleshooting topologi jaringan.",
            "emoji": "🌐",
        },
    },
]

# Topik per minggu, dipakai untuk mengisi course_weks. Hanya minggu
# `current_week` yang teksnya tampil (menjadi `weekLabel`), sisanya biar
# progress toggle punya sesuatu untuk ditulis.
_WEEK_TITLES: dict[str, list[str]] = {
    # Indeks `current_week - 1` WAJIB sama dengan `weekLabel` di data lama —
    # itulah yang dirender CourseCard sebagai label minggu berjalan.
    "c-matdis": [
        "Logika Proposisional", "Himpunan", "Relasi", "Fungsi", "Praktikum Aljabar",
        "Kombinatorik", "Graf", "Teori Graf & Pohon", "Pohon Berakar",
        "Graph Traversing", "Matching", "Warna Graf", "PenUTS", "Ujian Akhir",
    ],
    "c-strukdat": [
        "Array & Struktur Dasar", "Stack", "Queue", "Linked List", "Doubly Linked List",
        "Tree", "Binary Search Tree", "Heap", "Graph Algorithms & Dynamic Programming",
        "Hashing", "Shortest Path", "Sorting Lanjutan", "PenUTS", "Ujian Akhir",
    ],
    "c-os": [
        "Konsep Proses", "Thread", "Penjadwalan CPU", "Sinkronisasi & Mutex",
        "SINK & Deadlock", "Memori Fisik", "Scheduling & Deadlock", "File System",
        "I/O & Device", "Proteksi", "Praktikum Linux", "PenUTS", "Ujian Akhir",
    ],
    "c-pweb": [
        "HTML Semantik", "CSS Layout", "JavaScript Dasar", "DOM & Event",
        "Fetch & REST", "React Dasar", "React Router", "React Hooks & Fetch API",
        "State Management", "Aksesibilitas", "Testing", "Deployment",
        "PenUTS", "Ujian Akhir",
    ],
    "c-prak-pweb": [
        "Setup Environment", "Latihan Layout", "Form Handling", "Fetch API",
        "Komponen Terpisah", "Routing Praktik", "CRUD + Auth Sederhana",
        "CRUD + Auth Sederhana", "Validasi", "Deploy Static", "Review Kode",
        "Dokumentasi", "PenUTS", "Ujian Akhir",
    ],
    "c-pbo": [
        "Class & Object", "Encapsulation", "Inheritance", "Interface & Abstraction",
        "Abstraction & Interface", "Praktikum UML", "Polymorphism & SOLID",
        "Design Pattern Dasar", "Praktik Pattern", "Refactoring", "Studi Kasus",
        "Proyek", "PenUTS", "Ujian Akhir",
    ],
    "c-prak-alpro": [
        "Looping", "Array", "Fungsi", "Rekursi", "Sorting Dasar", "Searching",
        "Praktikum Trace", "Rekursi & Sorting", "Stack & Queue", "Rekursi & Sorting II",
        "Studi Kasus", "Proyek", "PenUTS", "Ujian Akhir",
    ],
    "c-jarkom": [
        "Model OSI", "Layer Fisik", "Data Link", "Network Layer", "IP Addressing",
        "Subnetting", "Subnetting & Routing", "Routing", "Transport & TCP",
        "DNS", "Keamanan Jaringan", "Praktikum Topologi", "PenUTS", "Ujian Akhir",
    ],
}

# Assistant di FilesPage.dipisah dari tutor matkul: ini persona workspace,
# bukan persona silenced per-matkul.
SEED_ASSISTANTS = [
    ("ast-raka", "Raka (Peer Tutor)", "surface-dark"),
    ("ast-planner", "Study Planner AI", "success-emerald"),
    ("ast-algo", "Algo Mentor", "secondary"),
    ("ast-thesis", "Thesis Advisor AI", "tertiary-container"),
    ("ast-if", "Informatics Assistant", "surface-dark"),
    ("ast-lab", "Lab Assistant AI", "success-emerald"),
    ("ast-group", "Study Group AI", "surface-dark"),
    ("ast-code", "Code Reviewer AI", "secondary"),
]

# Materi di halaman Files. `course_id` NULL = materi global. Jumlah file di sini
# sengaja TIDAK ikut dihitung ke metric "Materi Terindeks" di CoursesPage —
# metric itu hanya menghitung materi milik offering yang sedang diambil.
# `chunks` = 0 berarti pipeline indexing belum menghasilkan chunk.
SEED_FILES: list[dict] = [
    {
        "id": "f-algo-slides", "folder_id": "fld-lectures", "name": "Semester 5 Lecture Pack - Algorithms & Data Structures.pdf",
        "sub": "Added from LMS integration", "kind": "pdf", "size_mb": 12.4,
        "status": "indexed", "assistant": "ast-raka", "course_id": "c-strukdat", "chunks": 0,
    },
    {
        "id": "f-srs-template", "folder_id": "fld-code", "name": "Software Requirements Specification Template - SE Course.docx",
        "sub": "Auto-parsed 84 sections", "kind": "docx", "size_mb": 4.2,
        "status": "indexing", "index_progress": 98, "assistant": "ast-planner",
        "course_id": None, "chunks": 0,
    },
    {
        "id": "f-grades-csv", "folder_id": "fld-lectures", "name": "Student GPA & Attendance Raw Data.csv",
        "sub": "14,200 rows with course metadata", "kind": "csv", "size_mb": 28.1,
        "status": "ready", "assistant": "ast-algo", "course_id": None, "chunks": 0,
    },
    {
        "id": "f-thesis-draft", "folder_id": "fld-thesis", "name": "Thesis Proposal Draft & Supervisor Notes.pdf",
        "sub": "Summarized with bullet takeaways", "kind": "pdf", "size_mb": 1.8,
        "status": "indexed", "assistant": "ast-thesis", "course_id": None, "chunks": 0,
    },
    {
        "id": "f-hci-guide", "folder_id": "fld-lectures", "name": "HCI Guidelines & Campus App Design Tokens.pdf",
        "sub": "Official practicum handbook v3.1", "kind": "pdf", "size_mb": 18.5,
        "status": "indexed", "assistant": "ast-if", "course_id": "c-prak-pweb", "chunks": 0,
    },
    {
        "id": "f-grade-tracker", "folder_id": "fld-lectures", "name": "Semester Grade Tracker & GPA Projection.xlsx",
        "sub": "Grade weights & GPA projection models", "kind": "xlsx", "size_mb": 5.6,
        "status": "indexed", "assistant": "ast-planner", "course_id": None, "chunks": 0,
    },
    {
        "id": "f-lab-onboarding", "folder_id": "fld-lab-reports", "name": "Lab Onboarding Checklist 2025.docx",
        "sub": "Shared from Study Group workspace", "kind": "docx", "size_mb": 2.1,
        "status": "indexed", "assistant": "ast-lab", "course_id": "c-prak-alpro", "chunks": 0,
    },
    {
        "id": "f-discussion-templates", "folder_id": "fld-lectures", "name": "Discussion Templates & Forum Replies.txt",
        "sub": "Synced from LMS integration", "kind": "txt", "size_mb": 0.4,
        "status": "indexed", "assistant": "ast-group", "course_id": None, "chunks": 0,
    },
    {
        "id": "f-api-practicum", "folder_id": "fld-code", "name": "API Practicum Changelog September 2025.csv",
        "sub": "1,840 rows with endpoint metadata", "kind": "csv", "size_mb": 6.9,
        "status": "ready", "assistant": "ast-code", "course_id": "c-prak-pweb", "chunks": 0,
    },
    {
        "id": "f-secure-lab", "folder_id": "fld-lab-reports", "name": "Secure Coding Review & Lab Audit Evidence.pdf",
        "sub": "For practicum assistants only - restricted access", "kind": "pdf",
        "size_mb": 9.3, "status": "indexed", "assistant": "ast-code",
        "course_id": "c-prak-alpro", "access_level": "lab", "chunks": 0,
    },
    {
        "id": "f-scholarship-model", "folder_id": "fld-thesis", "name": "Scholarship Eligibility Model FY26.xlsx",
        "sub": "Scenario tabs + GPA thresholds", "kind": "xlsx", "size_mb": 3.7,
        "status": "indexed", "assistant": "ast-planner", "course_id": None, "chunks": 0,
    },
    {
        "id": "f-lab-notes", "folder_id": "fld-lab-reports", "name": "Lab Session Notes - Operating Systems Week 6.docx",
        "sub": "Auto-summarized from transcript", "kind": "docx", "size_mb": 1.2,
        "status": "indexing", "index_progress": 64, "assistant": "ast-raka",
        "course_id": "c-os", "chunks": 0,
    },
]

SEED_FOLDERS: list[dict] = [
    {"id": "fld-lectures", "name": "Lecture Slides & Modules", "badge_label": "Study Ready",
     "badge_tone": "rag", "icon": "folder", "course_id": None, "sort_order": 1},
    {"id": "fld-lab-reports", "name": "Lab Reports 2025", "badge_label": "Shared with Study Group",
     "badge_tone": "shared", "icon": "shared", "course_id": None, "sort_order": 2},
    {"id": "fld-code", "name": "Source Code & API Docs", "badge_label": "Study Indexed",
     "badge_tone": "vector", "icon": "code", "course_id": None, "sort_order": 3},
    {"id": "fld-thesis", "name": "Thesis & Final Projects", "badge_label": "Supervisor Only",
     "badge_tone": "confidential", "icon": "lock", "course_id": None, "sort_order": 4},
]


def _offering_id(course_id: str) -> str:
    return f"off-{TERM_ID}-{course_id}"


def _enrollment_id(course_id: str) -> str:
    return f"enr-{TERM_ID}-{course_id}"


def _week_titles(course_id: str) -> list[str]:
    titles = list(_WEEK_TITLES.get(course_id, []))
    while len(titles) < TOTAL_WEEKS:
        titles.append(f"Materi Mingguan {len(titles) + 1}")
    return titles[:TOTAL_WEEKS]


def _chunk_split(total_chunks: int, total_files: int) -> list[int]:
    """Bagi `total_chunks` ke `total_files` file, minimal 1 per file.

    Deterministik (tidak pakai random) supaya seed bisa diulang dan angka
    turunan selalu sama — test paritas bergantung pada itu.
    """
    if total_files <= 0:
        return []
    base, extra = divmod(total_chunks, total_files)
    return [base + (1 if i < extra else 0) for i in range(total_files)]


def _course_materials(course: dict, offering_id: str) -> list[CourseMaterial]:
    """Bikin baris materi supaya `rag_files`/`rag_chunks` = turunan COUNT/SUM."""
    files = course["rag_files"]
    splits = _chunk_split(course["rag_chunks"], files)
    topics = _week_titles(course["id"])
    out: list[CourseMaterial] = []
    for i in range(files):
        topic = topics[i % len(topics)]
        # Sebagian kecil masih diproses, sisanya selesai — supaya UI punya
        # kedua status tanpa perluFABRIK index_progress yang tidak masuk akal.
        status = "indexing" if i % 11 == 0 else "indexed"
        progress = 64 if status == "indexing" else 100
        out.append(
            CourseMaterial(
                id=f"mat-{course['id']}-{i + 1:03d}",
                offering_id=offering_id,
                tutor_id=course["tutor"]["id"],
                name=f"{course['code']} - {topic} ({i + 1:02d}).pdf",
                kind="pdf",
                source_label="LMS integration",
                derived_note=f"Auto-parsed {splits[i]} sections",
                size_mb=round(0.6 + ((i * 7) % 38) / 10, 1),
                status=status,
                index_progress=progress,
                access_level="student",
                chunk_count=splits[i],
                indexed_at=_utcnow() if status == "indexed" else None,
            )
        )
    return out


async def seed_courses(db: AsyncSession) -> bool:
    """Isi data awal. Return True kalau baris baru ditambahkan.

    Idempoten: dicek lewat isi tabel `courses`, bukan lewat tabel terpisah,
    supaya tidak butuh migrasi tambahan hanya untuk penanda seed.
    """
    existing = (await db.execute(select(func.count()).select_from(Course))).scalar_one()
    if existing:
        logger.info("Seed matkul dilewati: courses sudah berisi %s baris.", existing)
        return False

    now = _utcnow()
    # Urutan di bawah WAJIB. Unit of work SQLAlchemy mengurutkan flush berdasarkan
    # *relationship*, bukan kolom FK — dan models/course.py sengaja tidak punya
    # relationship (lihat docstring file itu). Tanpa relationship, urutan insert
    # jadi acak dan FK gagal muncul sebagai IntegrityError yang mrengsekut.
    # Jadi setiap level dependensi dipisah oleh `flush()` eksplisit.

    # Level 0 — tanpa FK masuk.
    db.add(
        Term(
            id=TERM_ID,
            label=TERM_LABEL,
            academic_year=ACADEMIC_YEAR,
            semester_no=SEMESTER_NO,
            starts_on=now.date(),
            ends_on=(now + timedelta(days=112)).date(),
            is_active=True,
        )
    )
    # Assistant FilesPage hidup di tabel yang sama dengan tutor matkul, supaya
    # `assistant` di tabel file tidak jadi denormalisasi terpisah.
    for aid, name, tone in SEED_ASSISTANTS:
        db.add(
            AiTutor(
                id=aid,
                name=name,
                description=f"Asisten workspace: {name}.",
                emoji="\U0001f916",
                avatar_tone=tone,
                model=None,
                status="running",
            )
        )
    await db.flush()

    # Level 1 — catalog.
    for course in SEED_COURSES:
        lec = course["lecturer"]
        db.add(
            Course(
                id=course["id"],
                code=course["code"],
                title=course["title"],
                kind=course["kind"],
                sks=course["sks"],
                focus=course["focus"],
                curriculum="Teknik Informatika",
                is_active=True,
            )
        )
        db.add(
            Lecturer(
                id=lec["id"],
                name=lec["name"],
                email=lec.get("email"),
                avatar_tone=lec["tone"],
            )
        )
    await db.flush()

    # Level 2 — offerings (butuh terms + courses).
    for course in SEED_COURSES:
        db.add(
            CourseOffering(
                id=_offering_id(course["id"]),
                course_id=course["id"],
                term_id=TERM_ID,
                class_label=course["class_label"],
                room=course["room"],
                status="aktif",
            )
        )
    await db.flush()

    # Level 3 — anak dari offering (butuh offerings, lecturers, tutors).
    for course in SEED_COURSES:
        cid = course["id"]
        oid = _offering_id(cid)
        lec = course["lecturer"]
        tutor = course["tutor"]

        db.add(
            OfferingLecturer(
                offering_id=oid,
                lecturer_id=lec["id"],
                role="utama",
                is_primary=True,
            )
        )
        for day, start, end in lec["slots"]:
            db.add(
                ConsultationSlot(
                    lecturer_id=lec["id"],
                    offering_id=oid,
                    day_of_week=day,
                    starts_at=start,
                    ends_at=end,
                    room=course["room"],
                    location="offline",
                )
            )

        db.add(
            AiTutor(
                id=tutor["id"],
                name=tutor["name"],
                description=tutor["desc"],
                emoji=tutor["emoji"],
                avatar_tone="secondary",
                model="gemini-2.0-flash",
                status="running",
            )
        )
        db.add(
            CourseTutor(
                offering_id=oid,
                tutor_id=tutor["id"],
                rag_namespace=f"course-{oid}",
                is_primary=True,
                temperature=0.3,
            )
        )
        db.add(
            Enrollment(
                id=_enrollment_id(cid),
                user_id=USER_ID,
                offering_id=oid,
                progress_percent=course["progress"],
                current_week=course["current_week"],
                featured=course["featured"],
                status="aktif",
            )
        )

        titles = _week_titles(cid)
        completed_weeks = round(course["progress"] / 100 * TOTAL_WEEKS)
        for wk in range(1, TOTAL_WEEKS + 1):
            db.add(
                CourseWeek(
                    offering_id=oid,
                    week_no=wk,
                    title=titles[wk - 1],
                    meeting_kind="praktikum" if course["kind"] == "praktikum" else "teori",
                    planned_on=now.date() + timedelta(weeks=wk - 1),
                    completed_at=now if wk <= completed_weeks else None,
                )
            )

        for material in _course_materials(course, oid):
            db.add(material)

    # Level 4 — folder (butuh offering). Flush dulu karena file di bawah menunjuk
    # folder_id.
    for folder in SEED_FOLDERS:
        db.add(
            MaterialFolder(
                id=folder["id"],
                name=folder["name"],
                badge_label=folder["badge_label"],
                badge_tone=folder["badge_tone"],
                icon=folder["icon"],
                offering_id=None,
                sort_order=folder["sort_order"],
            )
        )
    await db.flush()

    # Level 5 — file halaman Files (butuh offering + folder + tutor).
    offering_by_course = {c["id"]: _offering_id(c["id"]) for c in SEED_COURSES}
    for spec in SEED_FILES:
        db.add(
            CourseMaterial(
                id=spec["id"],
                offering_id=offering_by_course.get(spec.get("course_id")),
                folder_id=spec.get("folder_id"),
                tutor_id=spec["assistant"],
                name=spec["name"],
                kind=spec["kind"],
                source_label="Course Materials",
                derived_note=spec["sub"],
                size_mb=spec["size_mb"],
                status=spec["status"],
                index_progress=spec.get("index_progress", 100),
                access_level=spec.get("access_level", "student"),
                chunk_count=spec.get("chunks", 0),
                indexed_at=now if spec["status"] in ("indexed", "ready") else None,
            )
        )

    await db.commit()
    logger.info("Seed matkul selesai: %s course, %s file.", len(SEED_COURSES), len(SEED_FILES))
    return True

