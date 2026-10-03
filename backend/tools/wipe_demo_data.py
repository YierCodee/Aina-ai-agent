"""Hapus seluruh data contoh akademik (seed) supaya database 0 fresh.

Jalankan: .venv/bin/python -m backend.tools.wipe_demo_data [--force]

Yang DIHAPUS (urutan FK-safe, anak dulu):
  material_chunks -> course_materials -> course_tutors -> enrollments
  -> course_weeks -> offering_lecturers -> consultation_slots
  -> course_offerings -> courses -> lecturers -> ai_tutors
  -> material_folders -> terms

Yang DIPERTAHANKAN:
  - `alembic_version` (tanpanya backend lapor "belum dimigrasi")
  - `chat_sessions` + `chat_messages` (riwayat user, bukan dummy)

Pengaman: menolak jalan kalau `SEED_DEMO_DATA` masih true — tanpa itu,
restart backend berikutnya akan mengisi ulang seed via lifespan.
Pakai `--force` untuk melewati pengaman (tidak disarankan).
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

TABLES_IN_DELETE_ORDER = (
    "material_chunks",
    "course_materials",
    "course_tutors",
    "enrollments",
    "course_weeks",
    "offering_lecturers",
    "consultation_slots",
    "course_offerings",
    "courses",
    "lecturers",
    "ai_tutors",
    "material_folders",
    "terms",
)

KEPT = ("alembic_version", "chat_sessions", "chat_messages")


def _db_path() -> Path:
    from backend.core.config import settings

    url = settings.database_url
    if ":memory:" in url:
        raise SystemExit("DATABASE_URL :memory: — tidak ada yang di-wipe.")
    return Path(url.split(":///", 1)[-1].split("?", 1)[0])


def main() -> int:
    from backend.core.config import settings

    force = "--force" in sys.argv
    if settings.seed_demo_data and not force:
        print(
            "DITOLAK: SEED_DEMO_DATA masih true. Set SEED_DEMO_DATA=false di "
            "backend/.env dulu supaya restart tidak mengisi ulang seed "
            "(atau pakai --force)."
        )
        return 2

    path = _db_path()
    if not path.exists():
        print(f"Tidak ada file DB di {path} — tidak ada yang di-wipe.")
        return 0

    con = sqlite3.connect(str(path))
    try:
        con.execute("PRAGMA foreign_keys=ON")
        existing = {
            r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        total = 0
        for table in TABLES_IN_DELETE_ORDER:
            if table not in existing:
                continue
            before = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            con.execute(f"DELETE FROM {table}")
            total += before
            print(f"  {table}: {before} baris dihapus")
        con.commit()
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print(f"\nTotal {total} baris contoh dihapus dari {path}.")
        print(f"Dipertahankan: {', '.join(KEPT)}.")
        leftovers = ", ".join(
            f"{t}={(con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] if t in existing else 0)}"
            for t in (*TABLES_IN_DELETE_ORDER, *KEPT)
        )
        print(f"Sisa per tabel: {leftovers}")
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
