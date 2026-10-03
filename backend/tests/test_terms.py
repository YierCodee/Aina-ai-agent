"""Test endpoint & service semester (term).

Jalankan dari root repo:
    .venv/bin/python -m pytest backend/tests/test_terms.py -v

Mengunci kontrak API term yang dipakai dialog pengelola semester di halaman
Courses, plus integrasi dengan bug "Tidak ada semester aktif" di create_course.
"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path


def _run(coro):
    return asyncio.run(coro)


def _setup(tmp_path, monkeypatch):
    """Arahkan ke DB kosong + buat skema. Return module database."""
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_terms.db"
    )
    database.reset_db_for_tests()
    return database


async def _fresh_db(database):
    """DB dengan skema tapi TANPA term — kondisi awal bug enroll."""
    await database.create_schema_for_tests()
    factory = database.get_session_factory()
    db = factory()
    return db


def _term_payload(**overrides):
    from backend.schemas.courses import TermCreateIn

    base = {
        "label": "Semester Gasal 2025/2026",
        "academicYear": "2025/2026",
        "semesterNo": 1,
        "startsOn": "2025-08-01",
        "endsOn": "2025-12-15",
        "activate": True,
    }
    base.update(overrides)
    return TermCreateIn.model_validate(base)


# ---------------------------------------------------------------------------
def test_list_empty_tanpa_term(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        result = await svc.list_terms(db)
        await db.close()
        return result

    result = _run(_flow())
    assert result.items == []
    assert result.active_id is None


def test_create_activate_true_jadi_aktif(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        created = await svc.create_term(db, _term_payload())
        listing = await svc.list_terms(db)
        await db.close()
        return created, listing

    created, listing = _run(_flow())
    assert created.is_active is True
    assert created.id == "2025-1"
    assert listing.active_id == "2025-1"


def test_hanya_satu_aktif(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.models.course import Term
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        await svc.create_term(db, _term_payload())
        await svc.create_term(
            db,
            _term_payload(
                label="Semester Genap 2025/2026",
                academicYear="2025/2026",
                semesterNo=2,
                activate=True,
            ),
        )
        active_count = (
            await db.execute(
                select_count_active()
            )
        ).scalar_one()
        listing = await svc.list_terms(db)
        await db.close()
        return active_count, listing

    active_count, listing = _run(_flow())
    assert active_count == 1
    assert listing.active_id == "2025-2"


def select_count_active():
    from sqlalchemy import func, select

    from backend.models.course import Term

    return select(func.count()).select_from(Term).where(Term.is_active.is_(True))


def test_create_activate_false_tidak_mengubah_aktif(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        await svc.create_term(db, _term_payload())
        await svc.create_term(
            db,
            _term_payload(
                label="Semester Genap 2025/2026",
                academicYear="2025/2026",
                semesterNo=2,
                activate=False,
            ),
        )
        listing = await svc.list_terms(db)
        await db.close()
        return listing

    listing = _run(_flow())
    assert listing.active_id == "2025-1"
    assert len(listing.items) == 2


def test_validasi_payload(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        await db.close()

    _run(_flow())

    # semester_no di luar {1,2}
    try:
        _term_payload(semesterNo=3)
        raise AssertionError("semesterNo=3 harusnya ditolak")
    except Exception:
        pass

    # label kosong
    try:
        _term_payload(label="")
        raise AssertionError("label kosong harusnya ditolak")
    except Exception:
        pass

    # academic_year bukan YYYY/YYYY
    try:
        _term_payload(academicYear="2025")
        raise AssertionError("academicYear='2025' harusnya ditolak")
    except Exception:
        pass


def test_activate_term_tidak_ada(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        try:
            await svc.activate_term(db, "9999-1")
            raise AssertionError("harusnya NotFound")
        except svc.NotFound:
            pass
        await db.close()

    _run(_flow())


def test_ends_on_sebelum_starts_on(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        try:
            await svc.create_term(
                db,
                _term_payload(startsOn="2025-12-15", endsOn="2025-08-01"),
            )
            raise AssertionError("harusnya Conflict")
        except svc.Conflict:
            pass
        await db.close()

    _run(_flow())


def test_integrasi_bug_enroll_tanpa_term(tmp_path, monkeypatch):
    """Bug asli: create_course gagal 409 'Tidak ada semester aktif'.

    Setelah term dibuat + diaktifkan, create_course harus sukses.
    """
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _fresh_db(database)

        payload = CourseCreateIn.model_validate(
            {
                "code": "IF-301",
                "title": "Basis Data",
                "kind": "teori",
                "sks": 3,
                "classLabel": "Kelas A",
                "lecturer": {"name": "Dr. Ratna", "email": None, "avatarTone": "secondary"},
            }
        )

        try:
            await svc.create_course(db, payload)
            raise AssertionError("harusnya Conflict sebelum ada term")
        except svc.Conflict as exc:
            assert "Tidak ada semester aktif" in str(exc)

        await svc.create_term(db, _term_payload())
        card = await svc.create_course(db, payload)
        assert card.code == "IF-301"
        await db.close()

    _run(_flow())


def test_duplikat_id_term_409(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _fresh_db(database)
        await svc.create_term(db, _term_payload())
        try:
            await svc.create_term(db, _term_payload())
            raise AssertionError("harusnya IntegrityError")
        except Exception:
            pass
        await db.close()

    _run(_flow())
