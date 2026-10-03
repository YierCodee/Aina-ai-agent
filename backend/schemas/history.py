"""Skema response untuk endpoint riwayat."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SessionOut(BaseModel):
    id: str
    user_id: str
    title: str
    model: str | None = None
    message_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SessionListOut(BaseModel):
    total: int
    sessions: list[SessionOut]


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    tools_used: list[str] = Field(default_factory=list)
    model: str | None = None
    created_at: datetime | None = None


class MessageListOut(BaseModel):
    session_id: str
    total: int
    messages: list[MessageOut]
