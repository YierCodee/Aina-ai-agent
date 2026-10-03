"""Test pipeline RAG riil: parse/split/upload/ingest/search (tanpa API key asli).

Jalankan: .venv/bin/python -m pytest backend/tests/test_rag_ingest.py -v

Tiga hal yang dikunci:
1. `split_text` deterministik — ingest ulang teks sama = jumlah chunks sama.
2. Tanpa key -> `error` jujur + `chunk_count=0` (tidak pernah angka palsu).
3. Retrieval ter-scope `offering_id` — chunks matkul A tak terlihat matkul B.
"""
from __future__ import annotations

import asyncio

def _run(coro):
    return asyncio.run(coro)

def _setup(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_rag.db"
    )
    monkeypatch.setattr(settings, "storage_dir", f"{tmp_path}/materials")
    database.reset_db_for_tests()
    return database


def test_split_text_deterministik_dan_overlap():
    from backend.services.ingest_service import split_text

    text = ("Paragraf tentang graf dan pohon. " * 40 + "\n\n") * 3
    first = split_text(text, 800, 100)
    second = split_text(text, 800, 100)
    assert first == second
    assert len(first) >= 2
    assert all(len(c) <= 900 for c in first)
    assert split_text("   \n\n  ") == []
    assert split_text("pendek") == ["pendek"]


def test_parse_txt_csv_xlsx(tmp_path):
    from backend.services.ingest_service import parse_bytes

    assert "halo" in parse_bytes("halo dunia".encode(), "txt").lower()
    csv_text = parse_bytes("a,b\n1,2\n".encode(), "csv")
    assert "a | b" in csv_text

    import openpyxl

    wb = openpyxl.Workbook()
    wb.active["A1"] = "Graf"
    import io

    buf = io.BytesIO()
    wb.save(buf)
    assert "Graf" in parse_bytes(buf.getvalue(), "xlsx")


def test_upload_mencatat_storage_dan_queued(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.seed.courses_seed import seed_courses
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            assert await seed_courses(db)
            created = await svc.create_materials_upload(
                db, [("modul.txt", b"isi modul graf " * 50)], course_id="c-matdis"
            )
            assert len(created) == 1
            assert created[0].status in ("queued", "indexing")
            from pathlib import Path

            from backend.models.course import CourseMaterial

            row = await db.get(CourseMaterial, created[0].id)
            assert row.storage_path and Path(row.storage_path).exists()
            assert row.chunk_count == 0  # belum di-ingest = 0, bukan angka palsu
            await db.close()
            return True

    assert _run(_flow()) is True


def test_tanpa_key_ingest_error_jujur(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.seed.courses_seed import seed_courses
        from backend.services import course_service as svc
        from backend.services import ingest_service

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            assert await seed_courses(db)
            created = await svc.create_materials_upload(
                db, [("modul.txt", b"isi modul " * 100)], course_id="c-matdis"
            )
            mid = created[0].id
            await db.close()
        monkeypatch.setattr(ingest_service, "embed_texts", lambda texts: (_ for _ in ()).throw(
            ingest_service.MissingGeminiKey("GEMINI_API_KEY belum diisi")
        ))
        await ingest_service.run_ingest(mid)
        async with factory() as db2:
            from backend.models.course import CourseMaterial

            row = await db2.get(CourseMaterial, mid)
            await db2.close()
            return row.status, row.chunk_count, row.derived_note

    status, chunks, note = _run(_flow())
    assert status == "error"
    assert chunks == 0
    assert "GEMINI_API_KEY" in (note or "")


def test_search_hanya_milik_offering_sendiri(tmp_path, monkeypatch):
    import json

    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import select

        from backend.models.course import CourseMaterial, MaterialChunk
        from backend.services import ingest_service, search_service

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        vec_a = [1.0, 0.0, 0.0]
        vec_b = [0.0, 1.0, 0.0]
        async with factory() as db:
            from backend.seed.courses_seed import seed_courses

            assert await seed_courses(db)
            # Dua materi seed dari offering berbeda = dua namespace berbeda.
            mat_a = (
                await db.execute(
                    select(CourseMaterial).where(
                        CourseMaterial.offering_id == "off-2025-1-c-matdis"
                    ).limit(1)
                )
            ).scalar_one()
            mat_b = (
                await db.execute(
                    select(CourseMaterial).where(
                        CourseMaterial.offering_id == "off-2025-1-c-jarkom"
                    ).limit(1)
                )
            ).scalar_one()
            db.add(
                MaterialChunk(
                    id="chk-a1",
                    material_id=mat_a.id,
                    offering_id=mat_a.offering_id,
                    chunk_index=0,
                    text="graf pohon",
                    token_count=2,
                    embedding=json.dumps(vec_a),
                )
            )
            db.add(
                MaterialChunk(
                    id="chk-b1",
                    material_id=mat_b.id,
                    offering_id=mat_b.offering_id,
                    chunk_index=0,
                    text="subnet routing",
                    token_count=2,
                    embedding=json.dumps(vec_b),
                )
            )
            await db.commit()
            off_a = mat_a.offering_id
            await db.close()
        # search_chunks mengimpor embed_texts dari modul ingest di dalam
        # fungsi, jadi patch atribut modul ini terbaca saat dipanggil.
        monkeypatch.setattr(
            ingest_service, "embed_texts", lambda texts: [[1.0, 0.0, 0.0]]
        )
        async with factory() as db2:
            hits = await search_service.search_chunks(
                db2, offering_id=off_a, query="graf", top_k=5
            )
            await db2.close()
            return hits

    hits = _run(_flow())
    assert len(hits) == 1
    assert "graf" in hits[0]["text"]
