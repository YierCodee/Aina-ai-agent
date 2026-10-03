"""Test riwayat chat SQLite (tanpa butuh GEMINI_API_KEY).

Jalankan dari root repo:
    .venv/bin/python -m pytest backend/tests/test_history.py -v
"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path


def _run(coro):
    return asyncio.run(coro)


def _fresh_url(tmp_path_factory=None) -> str:
    tmp = Path(tempfile.mkdtemp())
    return f"sqlite+aiosqlite:///{tmp}/test_app.db"


def test_save_list_get_delete(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_app.db"
    )
    database.reset_db_for_tests()

    async def _flow():
        from backend.services import history_service

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            await history_service.save_turn(
                db, session_id="sesi-1", user_id="mahasiswa",
                user_message="Halo, apa itu fotosintesis?", reply="Proses ...",
                tools_used=[], model="test-model",
            )
            await history_service.save_turn(
                db, session_id="sesi-1", user_id="mahasiswa",
                user_message="Lanjutannya?", reply="Lanjutan ...",
                tools_used=["web_search"], model="test-model",
            )
        async with factory() as db:
            sessions, total = await history_service.list_sessions(
                db, user_id="mahasiswa"
            )
            assert total == 1
            assert sessions[0].id == "sesi-1"
            assert "fotosintesis" in sessions[0].title
            messages = await history_service.get_messages(db, "sesi-1")
            assert len(messages) == 4
            assert [m.role for m in messages] == [
                "user", "assistant", "user", "assistant",
            ]
            assert messages[3].tools_used == ["web_search"]
        async with factory() as db:
            assert await history_service.delete_session(db, "sesi-1") is True
            assert await history_service.delete_session(db, "sesi-1") is False
        await database.close_db()

    _run(_flow())


def test_save_user_only_on_error(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_app.db"
    )
    database.reset_db_for_tests()

    async def _flow():
        from backend.services import history_service

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            await history_service.save_user_only(
                db, session_id="sesi-gagal", user_id="mahasiswa",
                user_message="Pertanyaan gagal", error_code="TIMEOUT",
            )
        async with factory() as db:
            messages = await history_service.get_messages(db, "sesi-gagal")
            assert len(messages) == 1
            assert messages[0].role == "user"
        await database.close_db()

    _run(_flow())


def test_delete_all_sessions(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_app.db"
    )
    database.reset_db_for_tests()

    async def _flow():
        from backend.services import history_service

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            for sid in ("a-1", "a-2"):
                await history_service.save_turn(
                    db, session_id=sid, user_id="mahasiswa",
                    user_message="halo", reply="hai",
                    tools_used=[], model="t",
                )
            await history_service.save_turn(
                db, session_id="b-1", user_id="user-lain",
                user_message="halo", reply="hai",
                tools_used=[], model="t",
            )
        async with factory() as db:
            assert await history_service.delete_all_sessions(db, "mahasiswa") == 2
            sessions, total = await history_service.list_sessions(db, user_id="mahasiswa")
            assert total == 0
            # Milik user lain tidak ikut terhapus.
            sessions, total = await history_service.list_sessions(db, user_id="user-lain")
            assert total == 1
            assert await history_service.delete_all_sessions(db, "mahasiswa") == 0
        await database.close_db()

    _run(_flow())
