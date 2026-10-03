"""Retrieval RAG ter-scope satu offering (satu `rag_namespace`).

`search_chunks(db, offering_id, query, top_k)`:
1. Embed query via Gemini (`ingest_service.embed_texts`).
2. Ambil chunks milik `offering_id` saja — isolasi konteks.
3. Skor cosine di Python, kembalikan top_k.

Sengaja brute-force, bukan index vec0 dulu: jumlah chunks per matkul
ratusan, dan ini bebas dari native extension di bundle PyInstaller.
`sqlite-vec` tetap jadi dependensi dan siap dipakai untuk index vec0 saat
skala butuh; kontrak fungsi ini tidak berubah saat itu tiba.

Best-effort: key kosong / tidak ada chunks / embedding gagal -> return []
(pemanggil memakai chat biasa, bukan 500).
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select

logger = logging.getLogger(__name__)


async def search_chunks(
    db,
    *,
    offering_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict]:  # noqa: ANN001
    from backend.models.course import MaterialChunk
    from backend.services.ingest_service import (
        MissingGeminiKey,
        cosine,
        embed_texts,
    )

    cleaned = (query or "").strip()
    if not cleaned or not offering_id:
        return []
    try:
        vectors = embed_texts([cleaned])
    except MissingGeminiKey:
        return []
    except Exception:  # noqa: BLE001 - retrieval gagal = chat tanpa konteks
        logger.warning("Embed query gagal, lanjut tanpa konteks RAG", exc_info=True)
        return []
    if not vectors:
        return []
    query_vec = vectors[0]

    rows = (
        await db.execute(
            select(MaterialChunk).where(MaterialChunk.offering_id == offering_id)
        )
    ).scalars().all()
    scored: list[tuple[float, object]] = []
    for chunk in rows:
        if not chunk.embedding:
            continue
        try:
            vec = json.loads(chunk.embedding)
        except (ValueError, TypeError):
            continue
        if not isinstance(vec, list) or not vec:
            continue
        scored.append((cosine(query_vec, vec), chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: list[dict] = []
    for score, chunk in scored[: max(1, top_k)]:
        out.append(
            {
                "material_id": chunk.material_id,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "score": round(float(score), 4),
            }
        )
    return out


def format_context(chunks: list[dict]) -> str:
    """Bentuk blok konteks yang disuntik ke prompt tutor."""
    if not chunks:
        return ""
    parts = [f"[Materi {i+1}]\n{c['text']}" for i, c in enumerate(chunks)]
    return "KONTEKS MATERI (jawab hanya dari konteks ini bila relevan):\n" + "\n\n".join(
        parts
    )
