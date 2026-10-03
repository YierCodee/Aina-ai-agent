"""Menjalankan satu turn percakapan dengan agent.

Modul ini menjadi batas antara dunia ADK (async generator `Event`) dan
dipakai router HTTP. Tanggung jawabnya: kirim pesan, kumpulkan jawaban,
dan ubah kegagalan menjadi exception domain yang bisa dipetakan ke status
HTTP yang tepat.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from backend.core.config import settings

logger = logging.getLogger(__name__)


class AgentUnavailableError(RuntimeError):
    """Agent tidak bisa dibangun karena konfigurasi belum lengkap."""


class AgentRunError(RuntimeError):
    """Agent sudah dibangun, tapi satu turn gagal dijalankan.

    Args:
        message: Pesan yang aman ditampilkan ke pengguna.
        code: Kode error dari ADK atau None kalau tidak ada.
    """

    def __init__(self, message: str, code: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code


class AgentTimeoutError(AgentRunError):
    """Satu turn melewati batas waktu."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="TIMEOUT")

async def run_turn(
    message: str,
    *,
    user_id: str = "mahasiswa",
    session_id: str = "default",
) -> dict[str, Any]:
    """Jalankan satu turn percakapan dan kembalikan jawabannya.

    Args:
        message: Isi pesan mahasiswa. Harus tidak kosong.
        user_id: Identitas pengguna untuk session ADK.
        session_id: Id percakapan. Percakapan dengan id yang sama memakai
            riwayat yang sama selama server masih hidup.

    Returns:
        Dict dengan kunci:
        - `reply`: teks jawaban akhir dari agent.
        - `tools_used`: nama tool yang dipanggil pada turn ini.
        - `session_id`: id percakapan yang benar-benar dipakai.

    Raises:
        AgentUnavailableError: Key atau `google-adk` belum siap.
        AgentTimeoutError: Turn melebihi `settings.agent_turn_timeout`.
        AgentRunError: ADK melaporkan error, atau model tidak
            menghasilkan teks apa pun.
    """
    from backend.agent.agent import get_runner, unavailable_reason

    runner = get_runner()
    if runner is None:
        raise AgentUnavailableError(
            unavailable_reason() or "Agent belum siap dipakai."
        )

    from google.adk.agents.run_config import RunConfig
    from google.genai import types

    run_config = RunConfig(max_llm_calls=settings.agent_max_llm_calls)

    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=message)],
    )

    chunks: list[str] = []
    tools_used: list[str] = []

    async def _collect() -> None:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
            run_config=run_config,
        ):
            if event.error_code:
                raise AgentRunError(
                    event.error_message or "Agent gagal memproses pertanyaan.",
                    code=event.error_code,
                )

            for call in event.get_function_calls():
                if call.name and call.name not in tools_used:
                    tools_used.append(call.name)

            # Hanya teks jawaban yang jadi isi final, bukan event
            # pemanggilan tool maupun potongan antar-putusan.
            if not event.is_final_response():
                continue
            text = _event_text(event)
            if text:
                chunks.append(text)

    try:
        await asyncio.wait_for(_collect(), timeout=settings.agent_turn_timeout)
    except asyncio.TimeoutError as exc:
        raise AgentTimeoutError(
            f"Agent tidak menjawab dalam {settings.agent_turn_timeout} detik."
        ) from exc
    except asyncio.CancelledError:
        raise
    except AgentRunError:
        raise
    except Exception as exc:  # noqa: BLE001 - diterjemahkan jadi domain error
        logger.exception("Agent gagal menjalankan turn")
        raise AgentRunError(f"Agent gagal memproses pertanyaan: {exc}") from exc

    reply = "".join(chunks).strip()
    if not reply:
        raise AgentRunError(
            "Agent tidak menghasilkan jawaban. Coba ulangi pertanyaannya.",
            code="EMPTY_REPLY",
        )

    return {"reply": reply, "tools_used": tools_used, "session_id": session_id}


def _event_text(event: Any) -> str:
    """Gabungkan seluruh bagian teks dari satu event."""
    if not event.content or not event.content.parts:
        return ""
    return "".join(part.text for part in event.content.parts if part.text)
