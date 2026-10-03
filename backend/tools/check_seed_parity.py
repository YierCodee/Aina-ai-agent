"""Cek paritas: angka turunan dari database harus sama dengan mock lama.

Bandingkan hasil `course_service` (dari SQLite + seed) dengan angka yang pernah
dihitung di frontend dari `INITIAL_COURSES`:

    CoursesMetrics.tsx  -> totalSks, totalFiles, avgProgress
    CoursesPage.tsx     -> counts all/teori/praktikum/progress
    CourseCard.tsx      -> ragFiles & ragChunks per kartu

Jalankan: .venv/bin/python -m backend.tools.check_seed_parity
"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

# Angka yang HARUS cocok — disalin dari mock lama, bukan dari database.
EXPECTED = {
    "total_courses": 8,
    "total_sks": 20,
    # 224 materi milik offering + 6 file yang tadinya hanya ada di FilesPage tapi
    # sebenarnya milik matkul (OS notes, HCI guide, lab checklist, dst). Angkanya
    # naik dari 224 ke 230 karena relasi course_id-nya sekarang nyata — bukan bug.
    "total_files": 230,
    "avg_progress": 64,
    "dedicated_tutors": 8,
    "rag_isolation": 100,
    "counts": {"all": 8, "teori": 6, "praktikum": 2, "progress": 3},
    # (sks, progress, ragFiles, ragChunks, featured)
    # ragFiles naik dari mock lama pada 4 course: file FilesPage yang sekarang
    # terikat ke offering ikut terhitung (+1/+1/+2/+2 = 6, cocok dengan total_files).
    "courses": {
        "c-matdis": (3, 65, 32, 48, False),
        "c-strukdat": (3, 72, 55, 86, True),
        "c-os": (3, 58, 29, 36, False),
        "c-pweb": (3, 60, 24, 32, False),
        "c-prak-pweb": (1, 70, 20, 26, False),
        "c-pbo": (3, 55, 26, 34, False),
        "c-prak-alpro": (1, 80, 22, 30, False),
        "c-jarkom": (3, 50, 22, 28, False),
    },
    # Jadwal konsultasi harus kembali ke string yang sama seperti di mock.
    "consult": {
        "c-matdis": "Sel & Kam 13:00 - 15:00",
        "c-strukdat": "Senin 10:00 - 12:00",
        "c-os": "Rabu 14:00 - 16:00",
        "c-pweb": "Jumat 09:00 - 11:30",
        "c-prak-pweb": "Kamis 13:00 - 15:00",
        "c-pbo": "Selasa 10:00 - 12:00",
        "c-prak-alpro": "Senin 13:00 - 15:00",
        "c-jarkom": "Rabu 09:00 - 11:00",
    },
    # weekLabel harus kembali ke "Minggu N: Topik".
    "week_label": {
        "c-matdis": "Minggu 8: Teori Graf & Pohon",
        "c-strukdat": "Minggu 9: Graph Algorithms & Dynamic Programming",
        "c-os": "Minggu 7: Scheduling & Deadlock",
        "c-pweb": "Minggu 8: React Hooks & Fetch API",
        "c-prak-pweb": "Minggu 8: CRUD + Auth Sederhana",
        "c-pbo": "Minggu 7: Polymorphism & SOLID",
        "c-prak-alpro": "Minggu 8: Rekursi & Sorting",
        "c-jarkom": "Minggu 7: Subnetting & Routing",
    },
    # Inisial avatar. Dihitung dari nama dengan melewati gelar/jabatan, jadi
    # "Dr. Ir. Budi Hartono" -> "B" dan "Prof. Siti Rahmawati" -> "S" seperti
    # di data lama.
    # Satu perubahan yang disengaja: "Asisten Lab Web" -> "L", sedangkan mock
    # lama memakai "W" (diambil dari kata terakhir, tidak bisa diturunkan dari
    # nama). "Asisten Lab Algo" -> "L" sama seperti sebelumnya.
    "initial": {
        "c-matdis": "B", "c-strukdat": "S", "c-os": "A", "c-pweb": "D",
        "c-prak-pweb": "L", "c-pbo": "R", "c-prak-alpro": "L", "c-jarkom": "H",
    },
}


async def _run() -> list[str]:
    from backend.core import database
    from backend.core.config import settings

    tmp = Path(tempfile.mkdtemp())
    settings.database_url = f"sqlite+aiosqlite:///{tmp}/parity.db"
    database.reset_db_for_tests()

    from backend.seed.courses_seed import seed_courses
    from backend.services import course_service as svc

    failures: list[str] = []
    await database.create_schema_for_tests()
    factory = database.get_session_factory()
    async with factory() as db:
        seeded = await seed_courses(db)
        if not seeded:
            failures.append("seed_courses() mengembalikan False di DB kosong")

        listing = await svc.list_courses(db, sort="progress")
        m = listing.metrics
        for key, want in EXPECTED.items():
            if key in ("courses", "consult", "week_label", "initial", "counts"):
                continue
            got = getattr(m, key)
            if got != want:
                failures.append(f"metrics.{key}: dapat {got}, harus {want}")

        counts = listing.counts.model_dump()
        if counts != EXPECTED["counts"]:
            failures.append(f"counts: dapat {counts}, harus {EXPECTED['counts']}")

        by_id = {c.id: c for c in listing.items}
        if set(by_id) != set(EXPECTED["courses"]):
            failures.append(
                f"id course: dapat {sorted(by_id)}, harus {sorted(EXPECTED['courses'])}"
            )
        for cid, (sks, progress, files, chunks, featured) in EXPECTED["courses"].items():
            card = by_id.get(cid)
            if card is None:
                continue
            if (card.sks, card.progress, card.rag_files, card.rag_chunks, card.featured) != (
                sks, progress, files, chunks, featured
            ):
                failures.append(
                    f"{cid}: sks/progress/rag = "
                    f"{(card.sks, card.progress, card.rag_files, card.rag_chunks, card.featured)}, "
                    f"harus {(sks, progress, files, chunks, featured)}"
                )
            if card.week_label != EXPECTED["week_label"][cid]:
                failures.append(
                    f"{cid}.week_label: '{card.week_label}' != '{EXPECTED['week_label'][cid]}'"
                )
            if card.lecturer.initial != EXPECTED["initial"][cid]:
                failures.append(
                    f"{cid}.initial: '{card.lecturer.initial}' != '{EXPECTED['initial'][cid]}'"
                )

        # consult label butuh slot, jadi diambil lewat detail (yang belum dipisah
        # ke DTO kartu karena shape kartu harus tetap sama).
        for cid, want in EXPECTED["consult"].items():
            detail = await svc.get_course_detail(db, cid)
            slots = [(s.day_of_week, s.starts_at, s.ends_at) for s in detail.consultation]
            got = svc.consult_label(slots)
            if got != want:
                failures.append(f"{cid}.consult: '{got}' != '{want}'")

        # Sanity: total material FilesPage = 224 (kursus) + 12 (global/lain).
        mats = await svc.list_materials(db, limit=200)
        if mats.total != 236:
            failures.append(f"materials.total: {mats.total}, harus 236")
        if mats.stats.total_chunks != 320:
            failures.append(f"materials.chunks: {mats.stats.total_chunks}, harus 320")

        folders = await svc.list_folders(db)
        if len(folders.folders) != 4:
            failures.append(f"folders: {len(folders.folders)}, harus 4")
        total_foldered = sum(
            int(f.count.split()[0]) for f in folders.folders
        )
        if total_foldered != 12:
            failures.append(f"file dalam folder: {total_foldered}, harus 12")

        await db.close()

    await database.close_db()
    return failures


def main() -> int:
    failures = asyncio.run(_run())
    if failures:
        print("PARITAS GAGAL:")
        for f in failures:
            print("  -", f)
        return 1
    print("PARITAS OK: metrics, counts, kartu, jadwal, weekLabel, initial, folder")
    print("             semuanya sama dengan mock lama.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
