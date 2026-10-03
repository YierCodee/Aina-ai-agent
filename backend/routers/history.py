"""Endpoint riwayat: daftar sesi, isi pesan, hapus sesi."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.schemas.history import MessageListOut, MessageOut, SessionListOut, SessionOut
from backend.services import history_service

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/sessions", response_model=SessionListOut)
async def list_sessions(
    user_id: str = Query(default="mahasiswa", max_length=128),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> SessionListOut:
    sessions, total = await history_service.list_sessions(
        db, user_id=user_id, limit=limit, offset=offset
    )
    out: list[SessionOut] = []
    for s in sessions:
        count = await history_service.message_count(db, s.id)
        out.append(SessionOut(
            id=s.id, user_id=s.user_id, title=s.title, model=s.model,
            message_count=count, created_at=s.created_at,
            updated_at=s.updated_at,
        ))
    return SessionListOut(total=total, sessions=out)


@router.get("/sessions/{session_id}/messages", response_model=MessageListOut)
async def get_session_messages(
    session_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> MessageListOut:
    total = await history_service.message_count(db, session_id)
    if total == 0:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")
    messages = await history_service.get_messages(
        db, session_id, limit=limit, offset=offset
    )
    return MessageListOut(
        session_id=session_id,
        total=total,
        messages=[
            MessageOut(
                id=m.id, role=m.role, content=m.content,
                tools_used=list(m.tools_used or []), model=m.model,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


class DeleteAllOut(BaseModel):
    deleted: int


@router.delete("/sessions", response_model=DeleteAllOut)
async def delete_all_sessions(
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> DeleteAllOut:
    """Hapus SELURUH sesi milik user + pesannya. Tidak bisa dibatalkan."""
    count = await history_service.delete_all_sessions(db, user_id=user_id)
    return DeleteAllOut(deleted=count)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str, db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await history_service.delete_session(db, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")
