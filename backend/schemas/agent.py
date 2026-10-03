"""Skema request/response untuk endpoint chat."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Satu pesan dari mahasiswa."""

    message: str = Field(
        min_length=1,
        max_length=8000,
        description="Isi pertanyaan atau pernyataan mahasiswa.",
    )
    session_id: Optional[str] = Field(
        default="default",
        max_length=128,
        description=(
            "Id percakapan. Kosongkan untuk memakai sesi bawaan. Kirim id "
            "yang sama untuk melanjutkan percakapan sebelumnya."
        ),
    )
    user_id: str = Field(
        default="mahasiswa",
        max_length=128,
        description="Identitas pengguna untuk session ADK.",
    )


class ChatResponse(BaseModel):
    """Jawaban agent untuk satu pesan."""

    reply: str = Field(description="Jawaban akhir dari agent.")
    session_id: str = Field(description="Id percakapan yang dipakai.")
    tools_used: list[str] = Field(
        default_factory=list,
        description="Nama tool yang dipanggil pada turn ini.",
    )
    model: str = Field(description="Model Gemini yang aktif.")


class ChatErrorResponse(BaseModel):
    """Bentuk error yang dikembalikan endpoint chat."""

    error: str = Field(description="Pesan yang bisa ditampilkan ke user.")
