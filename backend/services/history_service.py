"""CRUD riwayat chat (tabel milik aplikasi, bukan state ADK).

ADK punya DB sendiri untuk konteks agent; modul ini untuk kebutuhan UI:
list sesi, isi pesan, hapus sesi.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.chat import ChatMessage, ChatSession

logger = logging.getLogger(__name__)

TITLE_LEN = 50


def _utcnow() -> datetime:
    """Naive UTC now (kolom DateTime SQLite tanpa timezone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def make_title(message: str) -> str:
    """Judul sesi dari potongan pesan pertama."""
    one_line = " ".join(message.split())
    if len(one_line) <= TITLE_LEN:
        return one_line or "Percakapan baru"
    return one_line[:TITLE_LEN].rstrip() + "…"


async def ensure_session(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: str = "mahasiswa",
    model: str | None = None,
    title_hint: str | None = None,
) -> ChatSession:
    """Ambil sesi atau buat baru. Tidak commit — caller yang commit."""
    session = await db.get(ChatSession, session_id)
    if session is not None:
        return session
    session = ChatSession(
        id=session_id,
        user_id=user_id,
        title=make_title(title_hint or "Percakapan baru"),
        model=model,
    )
    db.add(session)
    await db.flush()
    return session


async def save_turn(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    user_message: str,
    reply: str | None,
    tools_used: list[str] | None = None,
    model: str | None = None,
    error_code: str | None = None,
) -> ChatSession:
    """Simpan 1 turn (pesan user + jawaban assistant). Commit di akhir."""
    if model is None:
        from backend.models.gemini import get_model_name

        model = get_model_name()

    session = await ensure_session(
        db, session_id=session_id, user_id=user_id, model=model,
        title_hint=user_message,
    )
    # Sesi lama tanpa judul bermakna ikut diberi judul dari pesan pertama.
    if session.title in ("Percakapan baru", "") and user_message.strip():
        session.title = make_title(user_message)

    db.add(ChatMessage(
        session_id=session.id, role="user", content=user_message,
        tools_used=[], model=model,
    ))
    if reply:
        db.add(ChatMessage(
            session_id=session.id, role="assistant", content=reply,
            tools_used=list(tools_used or []), model=model,
            error_code=error_code,
        ))
    session.updated_at = _utcnow()
    await db.commit()
    await db.refresh(session)
    return session


async def save_user_only(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    user_message: str,
    error_code: str | None = None,
) -> None:
    """Simpan pesan user saat agent gagal — agar tidak hilang. Best-effort."""
    try:
        from backend.models.gemini import get_model_name

        model = get_model_name()
    except Exception:  # noqa: BLE001
        model = None
    try:
        session = await ensure_session(
            db, session_id=session_id, user_id=user_id, model=model,
            title_hint=user_message,
        )
        db.add(ChatMessage(
            session_id=session.id, role="user", content=user_message,
            tools_used=[], model=model, error_code=error_code,
        ))
        session.updated_at = _utcnow()
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
        logger.warning("Gagal menyimpan pesan user sesi %s", session_id)


async def list_sessions(
    db: AsyncSession, *, user_id: str, limit: int = 20, offset: int = 0,
) -> tuple[list[ChatSession], int]:
    """Daftar sesi terbaru dulu + total count untuk pagination."""
    total = (
        await db.execute(
            select(func.count())
            .select_from(ChatSession)
            .where(ChatSession.user_id == user_id)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
            .limit(min(max(limit, 1), 100))
            .offset(max(offset, 0))
        )
    ).scalars().all()
    return list(rows), int(total)


async def message_count(db: AsyncSession, session_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.session_id == session_id)
        )
    ).scalar_one()


async def get_messages(
    db: AsyncSession, session_id: str, *, limit: int = 100, offset: int = 0,
) -> list[ChatMessage]:
    rows = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.asc())
            .limit(min(max(limit, 1), 500))
            .offset(max(offset, 0))
        )
    ).scalars().all()
    return list(rows)


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    """Hapus sesi + pesannya (cascade). Return True kalau ada yang dihapus."""
    result = await db.execute(
        delete(ChatSession).where(ChatSession.id == session_id)
    )
    await db.commit()
    return (result.rowcount or 0) > 0


async def delete_all_sessions(db: AsyncSession, user_id: str) -> int:
    """Hapus SELURUH sesi milik user + pesannya. Return jumlah sesi terhapus."""
    result = await db.execute(
        delete(ChatSession).where(ChatSession.user_id == user_id)
    )
    await db.commit()
    return int(result.rowcount or 0)
