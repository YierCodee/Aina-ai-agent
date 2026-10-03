"""Test folder virtual: buat, duplikat per scope, isi, pindah, filter.

Jalankan dari root repo:
    .venv/bin/python -m pytest backend/tests/test_folders.py -v
"""
from __future__ import annotations

import asyncio


def _run(coro):
    return asyncio.run(coro)


def _setup(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_folders.db"
    )
    database.reset_db_for_tests()
    return database


async def _offering(db):
    """Term + course + offering minimal untuk folder ber-scope."""
    from backend.models.course import Course, CourseOffering, Term

    # Flush per level: tanpa relationship(), unit of work tidak mengurutkan
    # flush berdasarkan kolom FK (lihat docstring backend/models/course.py).
    db.add(Term(id="2025-1", label="Gasal 2025/2026", academic_year="2025/2026", semester_no=1, is_active=True))
    await db.flush()
    db.add(Course(id="c-x", code="IF-101", title="Contoh", kind="teori", sks=3, is_active=True))
    await db.flush()
    db.add(
        CourseOffering(
            id="off-1", course_id="c-x", term_id="2025-1",
            class_label="Kelas A", status="aktif",
        )
    )
    await db.commit()
    return "off-1"


async def _material(db, name="doc.pdf", folder_id=None):
    from backend.models.course import CourseMaterial

    row = CourseMaterial(
        id=f"mat-{name.replace('.', '-')}",
        offering_id=None,
        folder_id=folder_id,
        name=name,
        kind="pdf",
        size_mb=1.5,
        status="indexed",
        chunk_count=4,
    )
    db.add(row)
    await db.commit()
    return row.id


def test_create_global_folder_appears_empty(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        out = await svc.create_folder(db, name="Arsip")
        listing = await svc.list_folders(db)
        await db.close()
        return out, listing

    out, listing = _run(_flow())
    assert out.count == "0 files"
    assert out.size == "0 MB"
    assert out.badge.label == "Arsip"
    assert [f.name for f in listing.folders] == ["Arsip"]


def test_duplicate_name_rejected_per_scope(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        off = await _offering(db)
        await svc.create_folder(db, name="Tugas")
        # Nama sama, scope sama (global) -> Conflict.
        try:
            await svc.create_folder(db, name="  Tugas ")
            dup_global = False
        except svc.Conflict:
            dup_global = True
        # Nama sama, scope beda (per offering) -> boleh.
        scoped = await svc.create_folder(db, name="Tugas", offering_id=off)
        # Offering tak ada -> NotFound.
        try:
            await svc.create_folder(db, name="X", offering_id="off-tak-ada")
            bad_offering = False
        except svc.NotFound:
            bad_offering = True
        # Nama kosong -> Conflict.
        try:
            await svc.create_folder(db, name="   ")
            blank = False
        except svc.Conflict:
            blank = True
        await db.close()
        return dup_global, scoped, bad_offering, blank

    dup_global, scoped, bad_offering, blank = _run(_flow())
    assert dup_global is True
    assert scoped.name == "Tugas"
    assert bad_offering is True
    assert blank is True


def test_create_folder_via_course_id(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        await _offering(db)
        scoped = await svc.create_folder(db, name="Modul", course_id="c-x")
        try:
            await svc.create_folder(db, name="Y", course_id="c-tak-ada")
            bad = False
        except svc.NotFound:
            bad = True
        listing = await svc.list_folders(db)
        await db.close()
        return scoped, listing, bad

    scoped, listing, bad = _run(_flow())
    assert scoped.name == "Modul"
    assert [f.name for f in listing.folders] == ["Modul"]
    assert bad is True


def test_rename_file_and_folder(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        folder = await svc.create_folder(db, name="Lama")
        other = await svc.create_folder(db, name="Lain")
        renamed_folder = await svc.update_folder(db, folder.id, name="Baru", icon="lock")
        try:
            await svc.update_folder(db, other.id, name="Baru")
            dup = False
        except svc.Conflict:
            dup = True
        # Rename ke nama sendiri bukan duplikat.
        same = await svc.update_folder(db, other.id, name="Lain")
        mat = await _material(db, name="old.pdf", folder_id=folder.id)
        renamed_mat = await svc.update_material(db, mat, {"name": "new.pdf"})
        try:
            await svc.update_material(db, mat, {"name": "   "})
            blank = False
        except svc.Conflict:
            blank = True
        try:
            await svc.update_folder(db, "fld-tak-ada", name="X")
            missing = False
        except svc.NotFound:
            missing = True
        await db.close()
        return renamed_folder, dup, same, renamed_mat, blank, missing

    renamed_folder, dup, same, renamed_mat, blank, missing = _run(_flow())
    assert (renamed_folder.name, renamed_folder.icon) == ("Baru", "lock")
    assert dup is True
    assert same.name == "Lain"
    assert renamed_mat.name == "new.pdf"
    assert blank is True
    assert missing is True


def test_delete_folder_releases_files(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        folder = await svc.create_folder(db, name="Penuh")
        m1 = await _material(db, name="a.pdf", folder_id=folder.id)
        m2 = await _material(db, name="b.pdf", folder_id=folder.id)
        deleted, released = await svc.delete_folder(db, folder.id)
        remaining = await svc.list_folders(db)
        loose = await svc.list_materials(db)
        try:
            await svc.delete_folder(db, folder.id)
            missing = False
        except svc.NotFound:
            missing = True
        await db.close()
        return deleted, released, remaining, loose, missing, (m1, m2)

    deleted, released, remaining, loose, missing, ids = _run(_flow())
    assert (deleted, released) == (1, 2)
    assert remaining.folders == []
    # Isi tetap ada sebagai file lepas.
    assert loose.total == 2
    assert {m.id for m in loose.items} == set(ids)
    assert missing is True


def test_delete_material_removes_row_and_bytes(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from pathlib import Path

        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        blob = tmp_path / "victim.bin"
        blob.write_bytes(b"0123456789")
        created = await svc.create_materials_upload(db, [("v.bin", b"0123456789")])
        mat_id = created[0].id
        # Simulasikan storage_path nyata.
        from backend.models.course import CourseMaterial

        row = await db.get(CourseMaterial, mat_id)
        row.storage_path = str(blob)
        await db.commit()
        ok = await svc.delete_material(db, mat_id)
        again = await svc.delete_material(db, mat_id)
        await db.close()
        return ok, again, blob.exists()

    ok, again, still_exists = _run(_flow())
    assert ok is True
    assert again is False
    assert still_exists is False


def test_move_material_updates_counts_and_filter(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        folder = await svc.create_folder(db, name="Slide")
        mat = await _material(db)
        # Masuk folder: count jadi "1 file".
        await svc.update_material(db, mat, {"folder_id": folder.id})
        counts = {f.name: f.count for f in (await svc.list_folders(db)).folders}
        only_in = await svc.list_materials(db, folder_id=folder.id)
        all_mats = await svc.list_materials(db)
        # Keluar lagi dengan null eksplisit.
        await svc.update_material(db, mat, {"folder_id": None})
        counts_after = {f.name: f.count for f in (await svc.list_folders(db)).folders}
        # Folder tak ada -> NotFound.
        try:
            await svc.update_material(db, mat, {"folder_id": "fld-tak-ada"})
            bad = False
        except svc.NotFound:
            bad = True
        await db.close()
        return counts, only_in, all_mats, counts_after, bad

    counts, only_in, all_mats, counts_after, bad = _run(_flow())
    assert counts == {"Slide": "1 file"}
    assert [m.id for m in only_in.items] == ["mat-doc-pdf"]
    assert only_in.total == 1
    assert all_mats.total == 1
    assert counts_after == {"Slide": "0 files"}
    assert bad is True


def test_upload_straight_into_folder(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        await database.create_schema_for_tests()
        db = database.get_session_factory()()
        folder = await svc.create_folder(db, name="Uploads")
        created = await svc.create_materials_upload(
            db, [("a.pdf", b"x")], folder_id=folder.id
        )
        counts = {f.name: f.count for f in (await svc.list_folders(db)).folders}
        # Folder tak ada saat upload -> NotFound.
        try:
            await svc.create_materials_upload(db, [("b.pdf", b"x")], folder_id="fld-tak-ada")
            bad = False
        except svc.NotFound:
            bad = True
        await db.close()
        return created, counts, bad

    created, counts, bad = _run(_flow())
    assert len(created) == 1
    assert counts == {"Uploads": "1 file"}
    assert bad is True
    # Upload tanpa folder tetap file lepas (perilaku lama tidak berubah).
    _run(_upload_loose(database))


async def _upload_loose(database):
    from backend.services import course_service as svc

    db = database.get_session_factory()()
    created = await svc.create_materials_upload(db, [("loose.pdf", b"x")])
    loose = await svc.list_materials(db, folder_id="fld-tak-ada-xxx")
    await db.close()
    assert len(created) == 1
    assert loose.total == 0
