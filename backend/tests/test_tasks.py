"""Test skema & service Tasks/Copilot (tanpa butuh GEMINI_API_KEY)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta


def _run(coro):
    return asyncio.run(coro)


def _setup(tmp_path, monkeypatch):
    from backend.core import database
    from backend.core.config import settings

    monkeypatch.setattr(
        settings, "database_url", f"sqlite+aiosqlite:///{tmp_path}/test_tasks.db"
    )
    database.reset_db_for_tests()
    return database


async def _session(database):
    await database.create_schema_for_tests()
    factory = database.get_session_factory()
    return factory()


def test_task_create_list_toggle_delete(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.models.tasks import TaskWorkflow
        from backend.schemas.tasks import TaskCreateIn, TaskUpdateIn
        from backend.services import task_service as svc

        db = await _session(database)
        wf = TaskWorkflow(id="wf-test", name="Test Workflow", dot_tone="bg-secondary", sort_order=0)
        db.add(wf)
        await db.commit()

        created = await svc.create_task(
            db,
            TaskCreateIn(
                title="Review database normalization",
                priority="high",
                group="today",
                dueAt=datetime.utcnow() + timedelta(hours=3),
                tags=["#Database", "#Semester5"],
                workflowId="wf-test",
                actionLabel="Open Document",
                actionKind="open",
            ),
        )
        assert created.id.startswith("t-")
        assert created.completed is False
        assert created.dueTone in {"today", "future", "overdue"}

        listed = await svc.list_tasks(db, query="database", priority="high", sort="name")
        assert len(listed.items) == 1
        assert listed.items[0].id == created.id
        assert listed.counts.my == 1
        assert listed.counts.priority == 1
        assert listed.metrics.activeWorkload == 1
        assert listed.metrics.semesterTotal == 1
        assert listed.metrics.semesterDone == 0

        toggled = await svc.toggle_task(db, created.id)
        assert toggled.completed is True

        updated = await svc.update_task(db, created.id, TaskUpdateIn(note="Bab 1-3", tags=["#Database"]))
        assert updated.note == "Bab 1-3"
        assert updated.tags == ["#Database"]

        deleted = await svc.delete_task(db, created.id)
        assert deleted.deleted is True
        assert (await svc.list_tasks(db)).counts.my == 0
        await db.close()

    _run(_flow())


def test_task_out_json_alias_matches_frontend(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.tasks import TaskCreateIn
        from backend.services import task_service as svc

        db = await _session(database)
        created = await svc.create_task(
            db,
            TaskCreateIn(title="Task UI contract", priority="urgent", tags=["#HCI"]),
        )
        dumped = created.model_dump(mode="json", by_alias=True)
        assert set(dumped) >= {
            "id",
            "title",
            "priority",
            "tags",
            "due",
            "dueTone",
            "dueRank",
            "action",
            "group",
            "completed",
        }
        assert dumped["action"]["kind"] == "open"
        await db.close()

    _run(_flow())


def test_copilot_settings_defaults_and_update(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.tasks import CopilotSettingsUpdateIn
        from backend.services import task_service as svc

        db = await _session(database)
        settings = await svc.get_copilot_settings(db)
        assert settings.enabled is True
        updated = await svc.update_copilot_settings(
            db, CopilotSettingsUpdateIn(autoOrganize=True, syncLmsDiscussions=True)
        )
        assert updated.autoOrganize is True
        assert updated.syncLmsDiscussions is True
        await db.close()

    _run(_flow())


def test_lms_connection_and_class_event(tmp_path, monkeypatch):
    database = _setup(tmp_path, monkeypatch)

    async def _flow():
        from backend.schemas.tasks import ClassEventCreateIn, LmsConnectionCreateIn
        from backend.services import task_service as svc

        db = await _session(database)
        conn = await svc.create_lms_connection(
            db, LmsConnectionCreateIn(provider="moodle", name="LMS Kampus", baseUrl="https://lms.example")
        )
        assert conn.provider == "moodle"
        event = await svc.create_class_event(
            db,
            ClassEventCreateIn(
                title="Algorithms",
                startsAt=datetime.utcnow() + timedelta(days=1),
                endsAt=datetime.utcnow() + timedelta(days=1, hours=2),
                source="lms",
            ),
        )
        assert event.source == "lms"
        assert len(await svc.list_class_events(db)) == 1
        await db.close()

    _run(_flow())
