"""Test endpoint & service matkul (tanpa butuh GEMINI_API_KEY).

Jalankan dari root repo:
    .venv/bin/python -m pytest backend/tests/test_courses.py -v

Fokus test ini bukan detail query, tapi tiga hal yang paling mudah rusak diam-diam
saat pindah dari data mock ke database:

1. **Kontrak JSON.** Nama key harus persis seperti yang dibaca frontend
   (`weekLabel`, `ragFiles`, `sizeMB`, ...). Salah alias -> `undefined` di layar
   tanpa error kompilasi.
2. **Angka turunan.** `ragFiles`/`ragChunks`/metrics dihitung, bukan disimpan.
   Kalau join keliru, `SUM(sks)` akan meledak diam-diam.
3. **Filter & sort.** Setara dengan logika `useMemo` yang lama.
"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path


def _run(coro):
    return asyncio.run(coro)


def _setup(tmp_path, monkeypatch):
    """Arahkan ke DB kosong, buat skema, dan isi seed. Return session factory."""
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_courses.db"
    )
    database.reset_db_for_tests()
    return database


async def _seeded_session(database):
    from backend.seed.courses_seed import seed_courses

    await database.create_schema_for_tests()
    factory = database.get_session_factory()
    db = factory()
    assert await seed_courses(db), "seed_courses harus mengisi DB kosong"
    return db


# ---------------------------------------------------------------------------
def test_course_cards_match_seed(tmp_path, monkeypatch):
    """Angka turunan harus sama dengan angka yang dulu dihitung di frontend."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        listing = await svc.list_courses(db, sort="progress")
        by_id = {c.id: c for c in listing.items}
        await db.close()
        return listing, by_id

    listing, by_id = _run(_flow())

    assert listing.total == 8
    assert listing.metrics.total_courses == 8
    assert listing.metrics.total_sks == 20
    assert listing.metrics.avg_progress == 64
    # 224 materi offering + 6 file FilesPage yang terikat ke offering.
    assert listing.metrics.total_files == 230
    assert listing.metrics.dedicated_tutors == 8
    assert listing.metrics.rag_isolation == 100

    # ragFiles/ragChunks harus turunan COUNT/SUM, bukan kolom yang bisa basi.
    assert by_id["c-matdis"].rag_files == 32
    assert by_id["c-matdis"].rag_chunks == 48
    assert by_id["c-strukdat"].rag_files == 55
    assert by_id["c-strukdat"].rag_chunks == 86

    assert by_id["c-matdis"].week_label == "Minggu 8: Teori Graf & Pohon"
    assert by_id["c-matdis"].lecturer.initial == "B"
    assert by_id["c-matdis"].lecturer.tone == "secondary"
    assert by_id["c-strukdat"].featured is True
    assert by_id["c-matdis"].tutor is not None
    assert by_id["c-matdis"].tutor.name == "DiscreteMath AI"


def test_counts_match_quick_views(tmp_path, monkeypatch):
    """Empat quick view + ambang progress 60%."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        counts = (await svc.list_courses(db)).counts
        behind = await svc.list_courses(db, quick_view="progress")
        await db.close()
        return counts, behind

    counts, behind = _run(_flow())
    assert counts.model_dump() == {
        "all": 8, "teori": 6, "praktikum": 2, "progress": 3,
    }
    # c-pweb progress-nya tepat 60, jadi tidak masuk (< 60, bukan <= 60).
    # Urutannya progress DESC (sort default), bukan urutan seed.
    assert [c.id for c in behind.items] == ["c-os", "c-pbo", "c-jarkom"]
    assert all(c.progress < 60 for c in behind.items)


def test_filter_search_and_sort(tmp_path, monkeypatch):
    """Filter + sort harus setara dengan logika useMemo yang lama."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        result = {
            "teori": [c.id for c in (await svc.list_courses(db, tab="teori")).items],
            "search_code": [c.id for c in (await svc.list_courses(db, q="IF-204")).items],
            "search_lecturer": [
                c.id for c in (await svc.list_courses(db, q="siti")).items
            ],
            "search_tutor": [
                c.id for c in (await svc.list_courses(db, q="netbot")).items
            ],
            "sort_name": [c.title for c in (await svc.list_courses(db, sort="name")).items],
            "sort_sks": [c.sks for c in (await svc.list_courses(db, sort="sks")).items],
            "sort_progress": [
                c.progress for c in (await svc.list_courses(db, sort="progress")).items
            ],
            "combined": [
                c.id for c in (await svc.list_courses(db, tab="praktikum", sort="sks")).items
            ],
            # LIKE harus di-escape: "%" tidak boleh jadi wildcard.
            "wildcard": [c.id for c in (await svc.list_courses(db, q="%")).items],
        }
        await db.close()
        return result

    r = _run(_flow())

    # Set-nya yang penting di sini; urutan mengikuti sort default (progress DESC)
    # dan sudah diuji lewat r["sort_progress"].
    assert set(r["teori"]) == {
        "c-matdis", "c-strukdat", "c-os", "c-pweb", "c-pbo", "c-jarkom",
    }
    # "IF-204" cocok IF-204 dan IF-204P. Urutannya progress DESC: praktikum 70
    # lebih dulu dari teori 60.
    assert r["search_code"] == ["c-prak-pweb", "c-pweb"]
    assert r["search_lecturer"] == ["c-strukdat"]
    assert r["search_tutor"] == ["c-jarkom"]
    assert r["sort_name"] == sorted(r["sort_name"])
    assert r["sort_sks"] == [3, 3, 3, 3, 3, 3, 1, 1]
    assert r["sort_progress"] == [80, 72, 70, 65, 60, 58, 55, 50]
    # Dua-duanya SKS 1; pemutus akhir title ascending menempatkan "Algoritma" dulu.
    assert r["combined"] == ["c-prak-alpro", "c-prak-pweb"]
    assert r["wildcard"] == []


def test_json_alias_contract(tmp_path, monkeypatch):
    """Kunci JSON harus sama dengan yang dibaca komponen frontend."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        listing = await svc.list_courses(db)
        materials = await svc.list_materials(db)
        await db.close()
        return listing.model_dump(by_alias=True), materials.model_dump(by_alias=True)

    course_json, material_json = _run(_flow())

    item = course_json["items"][0]
    assert set(item) == {
        "id", "code", "title", "sks", "kelas", "kind", "focus", "weekLabel",
        "progress", "ragFiles", "ragChunks", "lecturer", "tutor", "featured",
    }
    assert set(item["lecturer"]) == {"name", "initial", "tone", "consult", "email"}
    assert set(item["tutor"]) == {"name", "desc", "emoji"}
    assert set(course_json["counts"]) == {"all", "teori", "praktikum", "progress"}
    assert set(course_json["metrics"]) == {
        "totalCourses", "totalSks", "totalFiles", "avgProgress",
        "dedicatedTutors", "ragIsolation",
    }

    # Bentuk FileDoc yang dipakai src/components/files/*.
    m = material_json["items"][0]
    assert set(m) == {
        "id", "name", "sub", "kind", "sizeLabel", "sizeMB", "modified",
        "modifiedTs", "status", "progress", "assistant", "courseId",
        "courseTitle", "accessLevel",
    }
    assert set(m["assistant"]) == {"initial", "name", "tone"}


def test_materials_and_folders(tmp_path, monkeypatch):
    """Materi FilesPage + angka folder yang dihitung."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        all_materials = await svc.list_materials(db, limit=200)
        by_kind = await svc.list_materials(db, kind="xlsx")
        by_course = await svc.list_materials(db, course_id="c-os")
        shared = await svc.list_materials(db, tab="shared")
        trash = await svc.list_materials(db, tab="trash")
        folders = await svc.list_folders(db)
        await db.close()
        return all_materials, by_kind, by_course, shared, trash, folders

    everything, xlsx, os_files, shared, trash, folders = _run(_flow())

    assert everything.total == 236
    assert everything.stats.total_chunks == 320
    assert everything.stats.indexing == 25  # 23 dari seed course + 2 file dari seed Files
    # Panjang diperiksa DULU sebelum `all(...)`. `all()` atas list kosong bernilai
    # True, jadi filter yang salah diam-diam lolos — itulah yang terjadi saat
    # join `course_materials.offering_id = courses.id` salah dan selalu nol baris.
    assert xlsx.items, "filter kind tidak boleh kosong"
    assert all(m.kind == "xlsx" for m in xlsx.items)

    assert os_files.items, "filter course_id tidak boleh kosong"
    assert all(m.course_id == "c-os" for m in os_files.items)
    assert all(m.course_title == "Sistem Operasi" for m in os_files.items)

    assert shared.items, "filter tab=shared tidak boleh kosong"
    assert all(m.kind in ("docx", "xlsx") for m in shared.items)
    assert trash.items == []

    assert len(folders.folders) == 4
    assert sum(int(f.count.split()[0]) for f in folders.folders) == 12


def test_detail_progress_and_tutor_session(tmp_path, monkeypatch):
    """Detail, update progres, dan scoping sesi tutor."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import ProgressIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        detail = await svc.get_course_detail(db, "c-matdis")
        manual = await svc.update_progress(
            db, "c-matdis", ProgressIn(progress_percent=77)
        )
        via_week = await svc.update_progress(
            db,
            "c-os",
            ProgressIn(week={"week_no": 12, "completed": True}),
        )
        session_a = await svc.create_tutor_session(db, "c-matdis")
        session_b = await svc.create_tutor_session(db, "c-matdis")
        await db.close()
        return detail, manual, via_week, session_a, session_b

    detail, manual, via_week, session_a, session_b = _run(_flow())

    assert len(detail.weeks) == 14
    assert detail.term.id == "2025-1"
    assert detail.tutor is not None
    assert detail.tutor.rag_namespace == "course-off-2025-1-c-matdis"
    assert len(detail.consultation) == 2

    assert manual.progress == 77

    # Seed menandai 8 dari 14 minggu selesai untuk c-os (progress 58%).
    # Menandai minggu ke-12 -> 9 selesai -> progress dihitung ulang jadi 64%.
    # Nilai lama 58% tidak boleh bocor: inilah yang membuktikan progress
    # diturunkan dari course_weeks, bukan hanya kolom yang ditulis manual.
    assert via_week.progress == round(9 * 100 / 14) == 64

    # Sesi tutor harus idempoten dan ter-scope ke offering.
    assert session_a.session_id == session_b.session_id
    assert session_a.tutor_id == "tut-matdis"
    assert session_a.rag_namespace.startswith("course-")


def test_tutor_sandbox_is_unique_per_offering(tmp_path, monkeypatch):
    """Dua matkul tidak boleh berbagi namespace RAG.

    Inilah yang membuat klaim "isolasi konteks" bisa ditegakkan, jadi diuji
    langsung lewat batasan UNIQUE, bukan lewat kode aplikasi.
    """
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy.exc import IntegrityError

        from backend.models.course import CourseTutor
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        error = None
        try:
            db.add(
                CourseTutor(
                    offering_id="off-2025-1-c-os",
                    tutor_id="tut-matdis",
                    rag_namespace="course-off-2025-1-c-matdis",  # duplikat
                    is_primary=False,
                )
            )
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            error = str(exc)
        await db.close()
        return error

    error = _run(_flow())
    # SQLite tidak menyebut nama index di pesan error, hanya kolomnya.
    assert error is not None
    assert "UNIQUE constraint failed" in error and "rag_namespace" in error


def test_not_found_paths(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        raised = []
        for call in (
            lambda: svc.get_course_detail(db, "tidak-ada"),
            lambda: svc.update_material(db, "tidak-ada", {"status": "ready"}),
            lambda: svc.create_tutor_session(db, "tidak-ada"),
        ):
            try:
                await call()
                raised.append(None)
            except svc.NotFound as exc:
                raised.append(str(exc))
        await db.close()
        return raised

    raised = _run(_flow())
    assert all(raised), raised


def test_schema_guard_catches_edited_revision(tmp_path, monkeypatch):
    """Revisi yang cocok tidak cukup — kolomnya juga harus ada.

    Kalau sebuah revision diedit setelah sempat ter-apply, `alembic_version`
    tetap mencatat id yang sama padahal tabelnya berbeda. Ini yang membuat
    seed gagal dengan "table ai_tutors has no column named avatar_tone" tanpa
    `/health`">(CHECK AGAIN) memberi tahu sebelumnya. Test ini memastikan
    sentinel check masih menangkapnya.
    """
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import text

        from backend.core.database import check_schema_revision

        healthy = await check_schema_revision()
        # Skema dibuat dengan create_all di test, jadi `alembic_version` belum ada.
        assert healthy.ok is False
        assert "belum dimigrasi" in healthy.message

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            await db.execute(
                text(
                    "CREATE TABLE alembic_version "
                    "(version_num VARCHAR(32) NOT NULL)"
                )
            )
            await db.execute(
                text("INSERT INTO alembic_version VALUES ('0003_tasks_copilot')")
            )
            await db.commit()
        # Tabel dibuat create_all, jadi semua sentinel harus ketemu.
        assert (await check_schema_revision()).ok is True
        return True

    assert _run(_flow()) is True


def test_schema_guard_reports_missing_sentinel(tmp_path, monkeypatch):
    """Sentinel yang hilang harus disebut namanya di pesan error."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import text

        from backend.core.database import check_schema_revision

        await database.create_schema_for_tests()
        factory = database.get_session_factory()
        async with factory() as db:
            await db.execute(
                text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
            )
            await db.execute(text("INSERT INTO alembic_version VALUES ('0003_tasks_copilot')"))
            # Buang satu tabel yang ada di sentinel.
            await db.execute(text("DROP TABLE course_tutors"))
            await db.commit()
        return await check_schema_revision()

    status = _run(_flow())
    assert status.ok is False
    assert "course_tutors" in status.message


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def _payload(**overrides) -> dict:
    """Payload create yang valid; override per test."""
    base = {
        "code": "IF-301",
        "title": "Basis Data",
        "kind": "teori",
        "sks": 3,
        "focus": "SQL, relasi, normalisasi",
        "classLabel": "Kelas A (R. 401)",
        "room": "R. 401",
        "lecturer": {"name": "Dr. Ratna Kusuma, S.Kom., M.T.", "avatarTone": "success-emerald"},
        "tutor": {"name": "DB Tutor AI", "description": "Bantuin SQL.", "emoji": "🗃️"},
        "progressPercent": 30,
        "currentWeek": 3,
        "featured": True,
        "weeks": [
            {"weekNo": 1, "title": "SQL Dasar", "completed": True},
            {"weekNo": 2, "title": "Relasi & Join", "completed": True},
            {"weekNo": 3, "title": "Normalisasi", "completed": False},
        ],
    }
    base.update(overrides)
    return base


def test_create_course_builds_all_three_layers(tmp_path, monkeypatch):
    """Satu permintaan harus menghasilkan katalog + offering + enrollment + anak."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        card = await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        await db.close()
        return card

    card = _run(_flow())
    assert card.code == "IF-301"
    assert card.title == "Basis Data"
    assert card.kelas == "Kelas A (R. 401)"
    assert card.progress == 30
    assert card.featured is True
    # weekLabel harus come dari course_weeks, bukan dari field yang dikirim.
    assert card.week_label == "Minggu 3: Normalisasi"
    assert card.lecturer.name == "Dr. Ratna Kusuma, S.Kom., M.T."
    assert card.lecturer.initial == "R"  # gelar dilewati
    assert card.lecturer.tone == "success-emerald"
    assert card.tutor is not None and card.tutor.name == "DB Tutor AI"
    assert card.rag_files == 0  # matkul baru belum punya materi
    assert card.rag_chunks == 0


def test_create_course_persists_expected_rows(tmp_path, monkeypatch):
    """Cek tabelnya langsung — kartu yang benar bisa saja datang dari data lain."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import func, select

        from backend.models.course import (
            Course, CourseOffering, CourseTutor, CourseWeek, Enrollment, OfferingLecturer,
        )
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        card = await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        counts = {
            "courses": (await db.execute(select(func.count()).select_from(Course))).scalar_one(),
            "offerings": (await db.execute(select(func.count()).select_from(CourseOffering))).scalar_one(),
            "enrollments": (await db.execute(select(func.count()).select_from(Enrollment))).scalar_one(),
            "weeks": (
                await db.execute(
                    select(func.count()).select_from(CourseWeek)
                    .where(CourseWeek.offering_id.like(f"%{card.id}%"))
                )
            ).scalar_one(),
            "lecturer_links": (
                await db.execute(
                    select(func.count()).select_from(OfferingLecturer)
                    .where(OfferingLecturer.offering_id.like(f"%{card.id}%"))
                )
            ).scalar_one(),
            "tutor_links": (
                await db.execute(
                    select(func.count()).select_from(CourseTutor)
                    .where(CourseTutor.offering_id.like(f"%{card.id}%"))
                )
            ).scalar_one(),
        }
        ns = (
            await db.execute(
                select(CourseTutor.rag_namespace)
                .join(CourseOffering, CourseTutor.offering_id == CourseOffering.id)
                .join(Course, CourseOffering.course_id == Course.id)
                .where(Course.id == card.id)
            )
        ).scalar_one()
        await db.close()
        return counts, ns

    counts, namespace = _run(_flow())
    # 8 dari seed + 1 baru di setiap lapis.
    assert counts == {
        "courses": 9, "offerings": 9, "enrollments": 9,
        "weeks": 3, "lecturer_links": 1, "tutor_links": 1,
    }
    assert namespace.startswith("course-off-2025-1-")


def test_create_rejects_duplicate_code(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        # Kode yang sama seperti salah satu course dari seed.
        payload = CourseCreateIn.model_validate(_payload(code="IF-201"))
        raised = None
        try:
            await svc.create_course(db, payload)
        except svc.Conflict as exc:
            raised = str(exc)
        await db.close()
        return raised

    raised = _run(_flow())
    assert raised and "IF-201" in raised


def test_update_course_is_partial_per_layer(tmp_path, monkeypatch):
    """Field katalog, offering, dan enrollment harus terpisah."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = await svc.get_course_detail(db, "c-matdis")
        after = await svc.update_course(
            db, "c-matdis",
            CourseUpdateIn.model_validate({"title": "Matematika Diskrit II", "progressPercent": 88}),
        )
        await db.close()
        return before, after

    before, after = _run(_flow())
    assert after.title == "Matematika Diskrit II"
    assert after.progress == 88
    # Tidak dikirim -> tidak berubah.
    assert after.code == before.course.code
    assert after.kelas == before.course.kelas
    assert after.lecturer.name == before.course.lecturer.name
    assert after.week_label == before.course.week_label
    assert after.rag_files == before.course.rag_files


def test_update_rejects_code_collision(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        raised = None
        try:
            await svc.update_course(db, "c-matdis", CourseUpdateIn.model_validate({"code": "IF-202"}))
        except svc.Conflict as exc:
            raised = str(exc)
        # Kode yang tidak berubah dari dirinya sendiri harus lolos.
        same = await svc.update_course(db, "c-matdis", CourseUpdateIn.model_validate({"code": "IF-201"}))
        await db.close()
        return raised, same.code

    raised, same_code = _run(_flow())
    assert raised and "IF-202" in raised
    assert same_code == "IF-201"


def test_update_lecturer_is_reused_not_duplicated(tmp_path, monkeypatch):
    """Dosen dengan nama sama harus dipakai ulang, bukan diduplikasi."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import func, select

        from backend.models.course import Lecturer
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = (
            await db.execute(
                select(func.count()).select_from(Lecturer)
                .where(Lecturer.name == "Asisten Lab Web")
            )
        ).scalar_one()
        card = await svc.update_course(
            db, "c-pbo",
            CourseUpdateIn.model_validate(
                {"lecturer": {"name": "Asisten Lab Web", "avatarTone": "surface-dark"}}
            ),
        )
        after = (
            await db.execute(
                select(func.count()).select_from(Lecturer)
                .where(Lecturer.name == "Asisten Lab Web")
            )
        ).scalar_one()
        await db.close()
        return before, after, card

    before, after, card = _run(_flow())
    assert before == 1
    assert after == 1, "dosen harus dipakai ulang, bukan baris baru"
    assert card.lecturer.name == "Asisten Lab Web"
    assert card.lecturer.tone == "surface-dark"


def test_update_can_unassign_tutor_and_affects_isolation(tmp_path, monkeypatch):
    """Lepas tutor = sandbox RAG hilang, dan metric ikut turun."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = await svc.list_courses(db)
        card = await svc.update_course(
            db, "c-matdis", CourseUpdateIn.model_validate({"tutor": None})
        )
        after = await svc.list_courses(db)
        await db.close()
        return before.metrics, after.metrics, card

    before, after, card = _run(_flow())
    assert card.tutor is None
    assert after.rag_isolation < before.rag_isolation
    # Test ini tidak menambah matkul: 8 offering, 7 yang punya sandbox -> 87.5% -> 88
    assert after.rag_isolation == round(7 * 100 / 8) == 88
    assert after.dedicated_tutors == before.dedicated_tutors - 1


def test_update_weeks_upsert_never_deletes(tmp_path, monkeypatch):
    """Minggu yang tidak dikirim tidak boleh hilang."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        await svc.update_course(
            db, "c-matdis",
            CourseUpdateIn.model_validate(
                {"weeks": [{"weekNo": 5, "title": "Topik Baru", "completed": True}]}
            ),
        )
        detail = await svc.get_course_detail(db, "c-matdis")
        await db.close()
        return detail.weeks

    weeks = _run(_flow())
    assert len(weeks) == 14, "minggu yang tidak dikirim harus tetap ada"
    fifth = next(w for w in weeks if w.week_no == 5)
    assert fifth.title == "Topik Baru"
    assert fifth.completed is True


def test_update_rejects_unknown_field(tmp_path, monkeypatch):
    """Guard terhadap field yang salah ketik di schema.

    `update_course` hanya memanggil `payload.model_dump(...)`, jadi stub
    berduck-typing cukup — dan ini satu-satunya cara menguji guard itu tanpa
    menambah field sungguhan ke skema.
    """
    database = _setup(tmp_path, monkeypatch)

    class StubPayload:
        def model_dump(self, **_kwargs):
            return {"title": "Aman", "kode": "IF-999"}

    async def _flow():
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        raised = None
        try:
            await svc.update_course(db, "c-matdis", StubPayload())
        except svc.Conflict as exc:
            raised = str(exc)
        await db.close()
        return raised

    raised = _run(_flow())
    assert raised and "kode" in raised


def test_drop_and_restore_roundtrip(tmp_path, monkeypatch):
    """Soft delete harus hilang dari semua angka, dan bisa dikembalikan."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = await svc.list_courses(db)
        await svc.drop_enrollment(db, "c-matdis")
        dropped = await svc.list_courses(db)
        restored = await svc.restore_enrollment(db, "c-matdis")
        after = await svc.list_courses(db)

        # "Restore saat aktif" harus konflik. Diperiksa DI SINI, sebelum
        # double-drop di bawah — setelah double-drop statusnya `dropped`, jadi
        # restore di titik itu justru berhasil dan tidak menguji apa pun.
        restore_conflict = None
        try:
            await svc.restore_enrollment(db, "c-matdis")
        except svc.Conflict as exc:
            restore_conflict = str(exc)

        # Hapus dua kali harus konflik, bukan diam-diam lolos.
        conflict = None
        try:
            await svc.drop_enrollment(db, "c-matdis")
            await svc.drop_enrollment(db, "c-matdis")
        except svc.Conflict as exc:
            conflict = str(exc)
        await db.close()
        return before, dropped, restored, after, conflict, restore_conflict

    before, dropped, restored, after, conflict, restore_conflict = _run(_flow())

    assert before.total == 8 and dropped.total == 7 and after.total == 8
    assert dropped.counts.all == 7
    assert dropped.metrics.total_courses == 7
    assert dropped.metrics.total_sks == before.metrics.total_sks - 3
    original = next(c for c in before.items if c.id == "c-matdis")
    assert restored.code == original.code
    assert restored.rag_files == original.rag_files  # materi tidak hilang
    assert conflict and "sudah dilepas" in conflict
    assert restore_conflict and "sedang aktif" in restore_conflict


def test_drop_keeps_weekly_and_material_rows(tmp_path, monkeypatch):
    """Soft delete tidak boleh menyentuh weeks/materi — itu syaratnya bisa undo."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import func, select

        from backend.models.course import CourseWeek
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = (
            await db.execute(
                select(func.count()).select_from(CourseWeek).where(
                    CourseWeek.offering_id == "off-2025-1-c-matdis"
                )
            )
        ).scalar_one()
        await svc.drop_enrollment(db, "c-matdis")
        after = (
            await db.execute(
                select(func.count()).select_from(CourseWeek).where(
                    CourseWeek.offering_id == "off-2025-1-c-matdis"
                )
            )
        ).scalar_one()
        await db.close()
        return before, after

    before, after = _run(_flow())
    assert before == after == 14


def test_reregister_after_drop_reuses_offering(tmp_path, monkeypatch):
    """Daftar ulang dengan kode yang sama harus jadi reuse, bukan 409.

    Ini dead-end yang nyata sebelum ada percakapan ini: soft delete menyisakan
    baris `courses`, jadi create dengan kode sama selalu ditolak — padahal pesan
    error-nya sendiri menyuruh "daftar ulang". Kode, offering, dan minggu harus
    dipakai ulang; hanya enrollment yang dihidupkan lagi.
    """
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from sqlalchemy import func, select

        from backend.models.course import Course, CourseOffering, CourseWeek, Enrollment
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        first = await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        await svc.drop_enrollment(db, first.id)

        # Create lagi tanpa `weeks` — minggu lama harus tetap ada.
        again = await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        course_rows = (
            await db.execute(select(func.count()).select_from(Course).where(Course.code == "IF-301"))
        ).scalar_one()
        offering_rows = (
            await db.execute(
                select(func.count()).select_from(CourseOffering).where(
                    CourseOffering.course_id == again.id
                )
            )
        ).scalar_one()
        weeks = (
            await db.execute(
                select(func.count()).select_from(CourseWeek).where(
                    CourseWeek.offering_id == f"off-2025-1-{again.id}"
                )
            )
        ).scalar_one()
        status = (
            await db.execute(
                select(Enrollment.status).where(Enrollment.id == f"enr-2025-1-{again.id}")
            )
        ).scalar_one()
        # Daftar kedua kali (matkul sudah aktif) harus konflik.
        duplicate = None
        try:
            await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        except svc.Conflict as exc:
            duplicate = str(exc)
        await db.close()
        return first, again, course_rows, offering_rows, weeks, status, duplicate

    first, again, courses, offerings, weeks, status, duplicate = _run(_flow())
    assert again.id == first.id, "harus memakai course yang sama"
    assert courses == 1, "katalog tidak boleh diduplikasi"
    assert offerings == 1, "offering tidak boleh diduplikasi"
    assert weeks == 3, "minggu lama harus dipertahankan"
    assert status == "aktif"
    assert duplicate and "IF-301" in duplicate


def test_reregister_replaces_lecturer_and_tutor(tmp_path, monkeypatch):
    """Daftar ulang harus memasang dosen/tutor dari form, bukan bring along yang lama."""
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseCreateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        first = await svc.create_course(db, CourseCreateIn.model_validate(_payload()))
        await svc.drop_enrollment(db, first.id)
        again = await svc.create_course(
            db,
            CourseCreateIn.model_validate(
                _payload(lecturer={"name": "Dr. Orang Lain", "avatarTone": "surface-dark"})
            ),
        )
        await db.close()
        return first, again

    first, again = _run(_flow())
    assert again.id == first.id
    assert again.lecturer.name == "Dr. Orang Lain"
    assert again.lecturer.tone == "surface-dark"


def test_class_label_is_not_split_by_frontend(tmp_path, monkeypatch):
    """`class_label` sudah memuat ruang; frontend tidak boleh memecahnya.

    Ronde penuh: baca kartu -> kirim balik apa adanya -> label harus utuh.
    Versi pertama memecah "Kelas B (R. 405)" jadi classLabel + room, dan
    ruangnya hilang dari kartu.
    """
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.courses import CourseUpdateIn
        from backend.services import course_service as svc

        db = await _seeded_session(database)
        before = (await svc.list_courses(db, q="Matematika")).items[0]
        after = await svc.update_course(
            db, "c-matdis",
            CourseUpdateIn.model_validate(
                {"title": "Matematika Diskrit II", "classLabel": before.kelas, "room": ""}
            ),
        )
        await db.close()
        return before.kelas, after.kelas

    before, after = _run(_flow())
    assert before == "Kelas A (R. 301)"
    assert after == before, "ruang harus tetap ada di label"


def test_documented_claims_match_the_code():
    """Dokumentasi yang melenceng lebih buruk daripada tidak ada dokumentasi.

    Orang berhenti mempercayainya begitu ketahuan satu kali salah, jadi setiap
    aturan yang menyebut nama class / fungsi / angka batas diverifikasi ke file
    aslinya. daftar check-nya di `backend/tools/check_docs_claims.py`.
    """
    from backend.tools import check_docs_claims

    failed = [label for label, passed in check_docs_claims.CHECKS if not passed]
    assert not failed, "klaim dokumentasi tidak cocok dengan kode:\n" + "\n".join(
        f"  - {label}" for label in failed
    )
    assert len(check_docs_claims.CHECKS) >= 25, "cek-nya jangan ikut berkurang"
