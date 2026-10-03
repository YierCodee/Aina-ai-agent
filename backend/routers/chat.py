"""Endpoint chat dengan agent asisten kuliah.

Satu request berisi satu pesan, satu response berisi satu jawaban utuh
(tidak ada streaming). Riwayat percakapan disimpan ganda:
- Konteks agent: ADK SessionService (persisten SQLite, lihat agent/agent.py).
- Riwayat aplikasi: tabel chat_sessions/chat_messages (SQLite via SQLAlchemy)
  untuk kebutuhan UI (list, baca ulang, hapus).
"""
import logging

from fastapi import APIRouter, HTTPException

from backend.agent.execute import (
    AgentRunError,
    AgentTimeoutError,
    AgentUnavailableError,
    run_turn,
)
from backend.schemas.agent import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agent"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """Kirim satu pesan ke agent dan dapatkan jawabannya.

    Balas dengan 503 kalau konfigurasi belum lengkap (API key kosong atau
    `google-adk` belum terpasang), 504 kalau agent melewati batas waktu,
    dan 502 kalau pemanggilan model gagal.
    """
    from backend.core.database import get_session_factory
    from backend.models.gemini import get_model_name
    from backend.services import history_service

    session_id = payload.session_id or "default"
    message = payload.message
    # RAG ter-scope: kalau sesi ini milik satu offering (dibuat via tutor-session),
    # suntik top chunks materi matkul itu ke pesan. Best-effort: gagal/ kosong =
    # chat biasa, tidak pernah 500 karena retrieval.
    try:
        factory = get_session_factory()
        async with factory() as rag_db:
            from backend.models.chat import ChatSession
            from backend.services import search_service

            sess = await rag_db.get(ChatSession, session_id)
            if sess is not None and sess.offering_id:
                chunks = await search_service.search_chunks(
                    rag_db,
                    offering_id=sess.offering_id,
                    query=payload.message,
                    top_k=5,
                )
                context = search_service.format_context(chunks)
                if context:
                    message = f"{context}\n\nPERTANYAAN MAHASISWA:\n{payload.message}"
    except Exception:  # noqa: BLE001 - retrieval tidak boleh menggagalkan chat
        logger.warning("Retrieval RAG dilewati, lanjut chat biasa", exc_info=True)
    try:
        result = await run_turn(
            message,
            user_id=payload.user_id,
            session_id=session_id,
        )
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentTimeoutError as exc:
        # Simpan pesan user walau agent timeout, agar tidak hilang.
        try:
            factory = get_session_factory()
            async with factory() as db:
                await history_service.save_user_only(
                    db, session_id=session_id, user_id=payload.user_id,
                    user_message=payload.message, error_code="TIMEOUT",
                )
        except Exception:  # noqa: BLE001 - riwayat best-effort
            logger.warning("Gagal menyimpan riwayat (timeout)", exc_info=True)
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except AgentRunError as exc:
        logger.warning("Turn chat gagal: %s", exc)
        try:
            factory = get_session_factory()
            async with factory() as db:
                await history_service.save_user_only(
                    db, session_id=session_id, user_id=payload.user_id,
                    user_message=payload.message,
                    error_code=getattr(exc, "code", None),
                )
        except Exception:  # noqa: BLE001 - riwayat best-effort
            logger.warning("Gagal menyimpan riwayat (error)", exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Simpan turn sukses. Best-effort: chat tetap dibalas walau DB gagal.
    try:
        factory = get_session_factory()
        async with factory() as db:
            await history_service.save_turn(
                db, session_id=result["session_id"], user_id=payload.user_id,
                user_message=payload.message, reply=result["reply"],
                tools_used=result["tools_used"], model=get_model_name(),
            )
    except Exception:  # noqa: BLE001 - riwayat best-effort
        logger.warning(
            "Gagal menyimpan riwayat sesi %s", result["session_id"],
            exc_info=True,
        )

    return ChatResponse(
        reply=result["reply"],
        session_id=result["session_id"],
        tools_used=result["tools_used"],
        model=get_model_name(),
    )
