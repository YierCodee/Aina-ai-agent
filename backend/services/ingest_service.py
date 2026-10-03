"""Pipeline ingest RAG riil: parse byte file -> split chunks -> embed -> simpan.

Alur per materi (`run_ingest(material_id)`):
  queued -> indexing(10: baca disk) -> indexing(40: parse+split)
  -> indexing(70: embed Gemini) -> indexed(chunk_count=N) / error(pesan jujur)

Keputusan sesuai kesepakatan:
- Storage lokal di `settings.storage_dir` (./data/materials, ikut .gitignore).
- TANPA batas ukuran kaku (user menolak 20MB): ukuran apa adanya dicatat di
  `size_mb`. Parse dibatasi memori wajar per jenis (baca penuh, tipikal modul).
- Kalau `GEMINI_API_KEY` kosong/placeholder: status `error` + `derived_note`
  eksplisit, `chunk_count=0`. Tidak pernah angka cantik palsu.
- Embedding disimpan sebagai JSON di `material_chunks.embedding` (TEXT).
  Paket `sqlite-vec` sudah jadi dependensi untuk index vec0 tahap berikut;
  retrieval saat ini cosine brute-force di Python (cukup untuk ratusan chunks
  per matkul) supaya tidak bergantung pada native extension di bundle
  PyInstaller. Kolom `offering_id` di tiap chunk menegakkan isolasi namespace.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import math
import re
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)


class MissingGeminiKey(RuntimeError):
    """GEMINI_API_KEY kosong/placeholder — ingest tidak bisa embed."""


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
def ensure_storage_dir() -> Path:
    from backend.core.config import settings

    path = Path(settings.storage_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_filename(name: str) -> str:
    base = Path(name).name.strip() or "upload.bin"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:180]


# ---------------------------------------------------------------------------
# Parse: byte file -> teks polos
# ---------------------------------------------------------------------------
def parse_bytes(data: bytes, kind: str, name: str = "") -> str:
    """Ekstrak teks dari byte file sesuai `kind`. Return teks (bisa kosong)."""
    kind = (kind or "").lower()
    if kind == "pdf":
        return _parse_pdf(data)
    if kind == "docx":
        return _parse_docx(data)
    if kind == "csv":
        return _parse_csv(data)
    if kind == "xlsx":
        return _parse_xlsx(data)
    if kind in ("txt", "md", "link"):
        return data.decode("utf-8", errors="ignore")
    # fallback: coba teks polos
    return data.decode("utf-8", errors="ignore")


def _parse_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - satu halaman rusak jangan gugurkan file
            continue
    return "\n\n".join(parts)


def _parse_docx(data: bytes) -> str:
    import docx

    doc = docx.Document(io.BytesIO(data))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())


def _parse_csv(data: bytes) -> str:
    text = data.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(text))
    rows = [" | ".join(cell.strip() for cell in row if cell.strip()) for row in reader]
    return "\n".join(r for r in rows if r)


def _parse_xlsx(data: bytes) -> str:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    parts: list[str] = []
    for ws in wb.worksheets:
        parts.append(f"# Sheet: {ws.title}")
        for row in ws.iter_rows(values_only=True):
            cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Split: teks -> chunks deterministik
# ---------------------------------------------------------------------------
def split_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Bagi teks jadi chunks ~`chunk_size` karakter dengan overlap.

    Deterministik (tanpa random) supaya ingest bisa diulang dan `chunk_count`
    stabil. Paragraf (`\\n\\n`) tidak dipotong di tengah kecuali paragrafnya
    sendiri lebih panjang dari `chunk_size`.
    """
    cleaned = re.sub(r"[ \t]+", " ", text or "").strip()
    if not cleaned:
        return []
    # Paragraf sebagai unit dasar; baris tunggal panjang dipecah paksa.
    paras: list[str] = []
    for block in re.split(r"\n\s*\n", cleaned):
        block = block.strip()
        if not block:
            continue
        while len(block) > chunk_size:
            paras.append(block[:chunk_size])
            block = block[chunk_size - overlap :]
        paras.append(block)

    chunks: list[str] = []
    current = ""
    for para in paras:
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                chunks.append(current.strip())
            # overlap: ekor chunk sebelumnya dibawa ke awal chunk baru
            current = f"{current[-overlap:]} {para}" if current and overlap else para
            current = current.strip()
            while len(current) > chunk_size:
                chunks.append(current[:chunk_size])
                current = current[chunk_size - overlap :]
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c.strip()]


# ---------------------------------------------------------------------------
# Embedding via Gemini
# ---------------------------------------------------------------------------
def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed batch teks via Gemini. Raise MissingGeminiKey kalau key kosong."""
    from backend.core.config import settings
    from backend.models.gemini import get_gemini_client, has_gemini_key

    if not texts:
        return []
    if not has_gemini_key():
        raise MissingGeminiKey(
            "GEMINI_API_KEY belum diisi di backend/.env — isi key lalu upload ulang."
        )
    client = get_gemini_client()
    if client is None:
        raise MissingGeminiKey(
            "GEMINI_API_KEY belum diisi di backend/.env — isi key lalu upload ulang."
        )
    vectors: list[list[float]] = []
    batch = 32
    for i in range(0, len(texts), batch):
        part = texts[i : i + batch]
        resp = client.models.embed_content(
            model=settings.gemini_embed_model, contents=part
        )
        # google-genai 2.x: resp.embeddings[i].values
        items = getattr(resp, "embeddings", None) or []
        if items:
            for item in items:
                vectors.append(list(getattr(item, "values", []) or []))
        else:  # fallback bentuk dict
            data = getattr(resp, "to_dict", lambda: {})() or {}
            for item in data.get("embeddings", []):
                vectors.append(list(item.get("values", [])))
    if len(vectors) != len(texts):
        raise RuntimeError(
            f"Embedding tidak lengkap: dapat {len(vectors)} dari {len(texts)} chunks."
        )
    return vectors


def cosine(a: list[float], b: list[float]) -> float:
    denom = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    if not denom:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / denom


# ---------------------------------------------------------------------------
# Worker: dijalankan sebagai FastAPI BackgroundTasks (sesi DB sendiri)
# ---------------------------------------------------------------------------
async def run_ingest(material_id: str) -> None:
    """Ingest satu materi sampai tuntas. Tidak pernah melempar (status error)."""
    from backend.core.database import get_session_factory
    from backend.models.course import CourseMaterial, MaterialChunk

    factory = get_session_factory()
    async with factory() as db:
        row = await db.get(CourseMaterial, material_id)
        if row is None:
            logger.warning("Ingest dilewati: materi %s tidak ada.", material_id)
            return
        try:
            await _ingest_row(db, row, MaterialChunk)
        except MissingGeminiKey as exc:
            row.status = "error"
            row.chunk_count = 0
            row.index_progress = 0
            row.derived_note = str(exc)[:255]
            await db.execute(
                MaterialChunk.__table__.delete().where(
                    MaterialChunk.material_id == material_id
                )
            )
            await db.commit()
            logger.warning("Ingest %s error (key): %s", material_id, exc)
        except Exception as exc:  # noqa: BLE001 - status error, bukan 500 diam
            logger.exception("Ingest %s gagal", material_id)
            row.status = "error"
            row.chunk_count = 0
            row.index_progress = 0
            row.derived_note = f"Gagal indeks: {exc}"[:255]
            await db.commit()


async def _ingest_row(db, row, MaterialChunk) -> None:  # noqa: ANN001, ANN202
    from sqlalchemy import delete

    from backend.core.config import settings

    row.status = "indexing"
    row.index_progress = 10
    row.derived_note = "Membaca file..."
    await db.commit()

    path = Path(row.storage_path) if row.storage_path else None
    if path is None or not path.exists():
        # Materi lama (seed) tidak punya byte file: jujur, bukan angka palsu.
        row.status = "error"
        row.chunk_count = 0
        row.index_progress = 0
        row.derived_note = "File sumber tidak ada (materi seed) — upload ulang."
        await db.commit()
        return

    data = path.read_bytes()
    row.size_mb = round(len(data) / (1024 * 1024), 2)
    row.index_progress = 40
    row.derived_note = "Mengekstrak teks..."
    await db.commit()

    text = parse_bytes(data, row.kind or "txt", row.name)
    chunks = split_text(text, settings.rag_chunk_size, settings.rag_chunk_overlap)
    if not chunks:
        row.status = "error"
        row.chunk_count = 0
        row.index_progress = 0
        row.derived_note = "Tidak ada teks terbaca — file kosong/gambar saja."
        await db.commit()
        return

    row.index_progress = 70
    row.derived_note = f"Embedding {len(chunks)} chunks..."
    await db.commit()

    vectors = embed_texts(chunks)  # raise MissingGeminiKey -> ditangani pemanggil

    await db.execute(delete(MaterialChunk).where(MaterialChunk.material_id == row.id))
    for idx, (chunk_text, vec) in enumerate(zip(chunks, vectors)):
        db.add(
            MaterialChunk(
                id=f"chk-{row.id[:40]}-{idx:04d}-{uuid4().hex[:6]}",
                material_id=row.id,
                offering_id=row.offering_id,
                chunk_index=idx,
                text=chunk_text,
                token_count=max(1, len(chunk_text) // 4),
                embedding=json.dumps(vec),
            )
        )
    row.chunk_count = len(chunks)
    row.status = "indexed"
    row.index_progress = 100
    row.derived_note = f"Auto-parsed {len(chunks)} sections • {len(text)} chars"
    from datetime import datetime, timezone

    row.indexed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    logger.info("Ingest %s selesai: %d chunks.", row.id, len(chunks))
