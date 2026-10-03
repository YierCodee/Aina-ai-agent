"""ORM riwayat chat: sesi + pesan.

Skema:
- `chat_sessions`: satu baris per percakapan (id = session_id dari ADK/frontend).
- `chat_messages`: pesan user/assistant penambah riwayat, FK cascade ke sesi.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_sessions_user_updated", "user_id", "updated_at"),
        Index("ix_sessions_offering", "offering_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), default="mahasiswa")
    title: Mapped[str] = mapped_column(String(255), default="Percakapan baru")
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Sesi tutor matkul. NULL = chat biasa (workspace), terisi = percakapan yang
    # sengaja di-scope ke satu offering supaya retrieval RAG tidak bleed ke
    # matkul lain. Diisi oleh POST /api/courses/{id}/tutor-session.
    offering_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="SET NULL"), nullable=True
    )
    tutor_id: Mapped[str | None] = mapped_column(
        ForeignKey("ai_tutors.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user','assistant','system','tool')", name="ck_messages_role"
        ),
        Index("ix_messages_session_created", "session_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    tools_used: Mapped[list[str]] = mapped_column(JSON, default=list)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )

    session: Mapped[ChatSession] = relationship(back_populates="messages")
