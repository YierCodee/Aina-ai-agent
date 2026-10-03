"""Tool LMS Bebas UMPO untuk agent (Playwright scraper).

Tiga fungsi di bawah didaftarkan ke ADK sebagai tool — pola sama dengan
`WEB_SEARCH_TOOL.py`: fungsi polos, docstring gaya Google (`Args:` +
`Returns:`), return `dict` (bukan string JSON).

Aturan verifikasi (lihat juga `backend/agent/prompt.py`):
- `lms_list_courses` dan `lms_list_activities`: boleh auto-jalan.
- `lms_get_assignment_detail`: BERAT (buka 1 halaman + parse tabel).
  Model wajib tulis plan + minta konfirmasi user dulu sebelum memanggil.

Semua fungsi sinkron (ADK FunctionTool) dan membungkus client async
`BebasUmpoPlaywright` via `asyncio.run`. Kalau Playwright / kredensial
belum siap, kembalikan `{"error": ...}` — jangan raise, supaya model bisa
menjelaskan ke user dengan ramah.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

#: Prefix penanda kredensial belum diisi (konsisten dengan WEB_SEARCH_TOOL).
_PLACEHOLDER_PREFIXES = ("ISI_", "YOUR_", "CHANGE", "PLACEHOLDER", "XXX")


def _is_configured(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip()
    if not v:
        return False
    return not v.upper().startswith(_PLACEHOLDER_PREFIXES)


def _lms_settings() -> tuple[str, str | None, str | None]:
    """Ambil base_url/username/password dari settings, fallback ke os.getenv."""
    try:
        from backend.core.config import settings

        base_url = (settings.lms_base_url or "").strip() or "https://bebas.umpo.ac.id"
        username = (settings.lms_username or "").strip() or None
        password = (settings.lms_password or "").strip() or None
    except Exception:  # noqa: BLE001 - settings gagal, coba env langsung
        import os

        base_url = os.getenv("LMS_BASE_URL", "https://bebas.umpo.ac.id")
        username = os.getenv("LMS_USERNAME")
        password = os.getenv("LMS_PASSWORD")
    return base_url, username, password


def _check_ready() -> dict[str, Any] | None:
    """Return dict error kalau belum bisa dipakai, else None."""
    try:
        import playwright  # noqa: F401  # cek dependency terpasang
    except ImportError:
        return {
            "error": "Paket playwright belum terpasang. Jalankan: "
            "pip install playwright beautifulsoup4 && playwright install chromium"
        }
    try:
        import bs4  # noqa: F401
    except ImportError:
        return {
            "error": "Paket beautifulsoup4 belum terpasang. Jalankan: "
            "pip install beautifulsoup4"
        }
    _, username, password = _lms_settings()
    if not _is_configured(username) or not _is_configured(password):
        return {
            "error": "LMS_USERNAME / LMS_PASSWORD belum diisi di backend/.env, "
            "jadi data LMS tidak bisa diambil."
        }
    return None


def _run(coro):
    """Jalankan coroutine async dari tool sinkron."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        # ADK memanggil tool secara sinkron; kalau sudah di dalam event
        # loop (misal saat test async), pakai thread baru agar tidak deadlock.
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


def lms_list_courses() -> dict[str, Any]:
    """Melihat daftar mata kuliah milik mahasiswa di LMS.

    Gunakan tool ini kalau mahasiswa bertanya "matkul apa saja",
    "course saya", atau sebelum mencari tugas tapi belum tahu course_id.
    Tool ini ringan dan boleh langsung dipanggil tanpa konfirmasi.

    Returns:
        Dict berisi `courses` (daftar dict dengan kunci `course_id`,
        `name`, `url`) dan `count`. Kalau gagal, hanya ada kunci `error`.
    """
    logger.info("Agent memanggil lms_list_courses")
    if (err := _check_ready()) is not None:
        return err
    try:
        from backend.agent.task import BebasUmpoPlaywright

        client = BebasUmpoPlaywright()
        courses = _run(client.list_my_courses())
        return {"courses": courses, "count": len(courses)}
    except Exception as exc:  # noqa: BLE001 - diteruskan sebagai pesan user
        logger.warning("lms_list_courses gagal: %s", exc)
        return {"error": f"Gagal mengambil daftar matkul: {exc}"}


def lms_list_activities(course_id: int) -> dict[str, Any]:
    """Melihat daftar tugas dan quiz dalam satu mata kuliah.

    Gunakan tool ini setelah course_id diketahui (dari lms_list_courses
    atau dari user). Tool ini ringan dan boleh langsung dipanggil tanpa
    konfirmasi. Jangan menebak isi tugas — selalu panggil tool ini dulu.

    Args:
        course_id: ID course LMS (angka di URL course/view.php?id=...).
            Contoh: 1234.

    Returns:
        Dict berisi `course_id`, `assign` (daftar tugas), `quiz`
        (daftar quiz), dan `count`. Tiap item punya kunci `type`,
        `cmid`, `title`, `section`, `url`. Kalau gagal, hanya ada
        kunci `error`.
    """
    logger.info("Agent memanggil lms_list_activities: course_id=%s", course_id)
    try:
        cid = int(course_id)
    except (TypeError, ValueError):
        return {"error": f"course_id tidak valid: {course_id!r}. Harus angka."}
    if (err := _check_ready()) is not None:
        return err
    try:
        from backend.agent.task import BebasUmpoPlaywright

        client = BebasUmpoPlaywright()
        activities = _run(client.get_activities(cid))
        assigns = [a for a in activities if a.get("type") == "assign"]
        quizzes = [a for a in activities if a.get("type") == "quiz"]
        return {
            "course_id": cid,
            "assign": assigns,
            "quiz": quizzes,
            "count": len(activities),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("lms_list_activities gagal: %s", exc)
        return {"error": f"Gagal mengambil aktivitas course {cid}: {exc}"}


def lms_get_assignment_detail(cmid: int) -> dict[str, Any]:
    """Melihat detail dan status pengumpulan satu tugas.

    PENTING — tool ini berat (membuka halaman tugas + parsing tabel).
    Jangan panggil langsung. Tulis dulu rencana + minta konfirmasi user
    dengan menyebut judul/cmiddan URL-nya, jalan hanya setelah user
    menjawab "Lanjut". Contoh: "Saya akan buka .../mod/assign/view.php
    ?id=38435 untuk cek status pengumpulan. Boleh lanjut?"

    Args:
        cmid: Course Module ID tugas (angka di URL mod/assign/view.php
            ?id=...). Contoh: 38435.

    Returns:
        Dict berisi `title`, `instructions`, `submission_status`,
        `grading_status`, `last_modified`, `submitted_files`,
        `available_action`, `cmid`, `url`. Kalau gagal, hanya ada
        kunci `error`.
    """
    logger.info("Agent memanggil lms_get_assignment_detail: cmid=%s", cmid)
    try:
        mid = int(cmid)
    except (TypeError, ValueError):
        return {"error": f"cmid tidak valid: {cmid!r}. Harus angka."}
    if (err := _check_ready()) is not None:
        return err
    try:
        from backend.agent.task import BebasUmpoPlaywright

        client = BebasUmpoPlaywright()
        return _run(client.get_assignment_detail(mid))
    except Exception as exc:  # noqa: BLE001
        logger.warning("lms_get_assignment_detail gagal: %s", exc)
        return {"error": f"Gagal membuka halaman tugas cmid={mid}: {exc}"}
