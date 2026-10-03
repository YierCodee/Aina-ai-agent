"""Agent asisten kuliah (Google ADK).

Satu tempat untuk membangun LlmAgent + App + Runner. Semua objek dibuat
secara lazy dan di-cache sebagai singleton, mengikuti pola yang sama dengan
`models/gemini.py`: tidak ada koneksi ke Gemini maupun import `google.adk`
saat modul ini diimpor, sehingga server tetap bisa start dan `/health`
tetap menjawab walau `GEMINI_API_KEY` kosong.
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.agent.prompt import AGENT_NAME, APP_NAME, build_instruction
from backend.core.config import settings
from backend.tools.WEB_SEARCH_TOOL import web_search
from backend.tools.lms_tools import (
    lms_get_assignment_detail,
    lms_list_activities,
    lms_list_courses,
)

logger = logging.getLogger(__name__)

#: Nama tool yang dipasang ke agent. Dipakai `execute.py` untuk melabeli
#: pemanggilan tool di respons HTTP.
TOOL_NAMES = (
    "web_search",
    "lms_list_courses",
    "lms_list_activities",
    "lms_get_assignment_detail",
)

#: Cache singleton. None = belum pernah dibangun.
_runner = None

#: Alasan kenapa runner tidak bisa dibangun. None = belum ada masalah.
_unavailable_reason: Optional[str] = None


def get_runner():
    """Kembalikan `Runner` siap pakai, atau None kalau belum bisa dibangun.

    None berarti ada konfigurasi yang belum lengkap (API key kosong atau
    `google-adk` belum terpasang). Pemanggil wajib menangani None dengan
    pesan ramah ke user, bukan melempar error. Gunakan
    `unavailable_reason()` untuk tahu alasannya.

    Runner dibangun hanya sekali lalu dipakai ulang. Ini penting karena
    session service menyimpan riwayat percakapan. Sejak migrasi SQLite,
    riwayat itu persisten di `settings.adk_database_url`, bukan lagi
    hilang setiap server dimatikan (dulu `InMemorySessionService`).
    """
    global _runner, _unavailable_reason

    if _runner is not None:
        return _runner
    if _unavailable_reason is not None:
        return None

    from backend.models.gemini import get_gemini_client, get_model_name

    client = get_gemini_client()
    if client is None:
        _unavailable_reason = "GEMINI_API_KEY belum diisi di backend/.env"
        logger.warning("Agent tidak dibangun — %s", _unavailable_reason)
        return None

    try:
        from google.adk.agents import LlmAgent
        from google.adk.apps import App
        from google.adk.models import Gemini
        from google.adk.runners import Runner
    except ImportError as exc:
        _unavailable_reason = (
            "google-adk belum terpasang. Jalankan: "
            "pip install -r backend/requirements.txt"
        )
        logger.error("google-adk tidak bisa diimpor: %s", exc)
        return None

    session_service = _build_session_service()
    if session_service is None:
        return None

    # `Gemini(client=...)` memakai instance client yang sudah ada, bukan
    # membuat baru dari environment. Ini yang membuat pipeline key milik
    # models/gemini.py tetap berlaku di dalam ADK.
    model = Gemini(model=get_model_name(), client=client)

    agent = LlmAgent(
        name=AGENT_NAME,
        model=model,
        instruction=build_instruction(),
        tools=[
            web_search,
            lms_list_courses,
            lms_list_activities,
            lms_get_assignment_detail,
        ],
        generate_content_config={"temperature": settings.agent_temperature},
    )

    # App() memvalidasi `name` dengan regex ketat dan menolak "user".
    # Karena itu APP_NAME di prompt.py yang dipakai, bukan settings.app_name.
    app = App(name=APP_NAME, root_agent=agent)

    _runner = Runner(
        app=app,
        session_service=session_service,
        # Tanpa ini, percakapan pertama dengan session_id baru akan
        # melempar SessionNotFoundError.
        auto_create_session=True,
    )
    logger.info("Agent %r siap (model: %s)", AGENT_NAME, get_model_name())
    return _runner


def _build_session_service():
    """Session ADK persisten (SQLite), fallback ke memori kalau gagal.

    Return None + set `_unavailable_reason` hanya untuk error fatal yang
    tidak bisa di-fallback. Missing `sqlalchemy` bukan fatal — fallback
    ke InMemory agar server tetap hidup (sesuai pola lazy di modul ini).
    """
    global _unavailable_reason

    from pathlib import Path

    # Pastikan folder DB ADK ada sebelum ADK membuka file-nya.
    adk_url = settings.adk_database_url
    if adk_url.startswith("sqlite") and ":memory:" not in adk_url:
        db_file = adk_url.split(":///", 1)[-1].split("?", 1)[0]
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)

    try:
        from google.adk.sessions import DatabaseSessionService
    except ImportError as exc:
        logger.warning(
            "sqlalchemy belum terpasang — sesi ADK fallback ke memori: %s", exc
        )
        from google.adk.sessions import InMemorySessionService

        return InMemorySessionService()

    try:
        return DatabaseSessionService(db_url=adk_url)
    except Exception as exc:  # noqa: BLE001 - fallback agar server tetap hidup
        logger.warning(
            "DatabaseSessionService gagal (%s) — fallback ke memori.", exc
        )
        from google.adk.sessions import InMemorySessionService

        return InMemorySessionService()


def unavailable_reason() -> Optional[str]:
    """Alasan kenapa agent tidak bisa dibangun, atau None kalau siap."""
    if _runner is not None:
        return None
    if _unavailable_reason is None:
        get_runner()  # memaksa evaluasi supaya alasannya terisi
    return _unavailable_reason


def reset_runner() -> None:
    """Buang runner singleton. Dipakai saat key diganti saat runtime / test."""
    global _runner, _unavailable_reason
    _runner = None
    _unavailable_reason = None
