"""Query & formatting untuk halaman Tasks dan Copilot.

Semua angka quick-view dan metric dihitung dari isi tabel di sini, bukan
disimpan. Query memakai join eksplisit (tidak ada `relationship()`), matching
dengan pola `course_service.py`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tasks import (
    ClassEvent,
    CopilotJob,
    CopilotSetting,
    LmsConnection,
    Task,
    TaskSubtask,
    TaskTag,
    TaskTagLink,
    TaskWorkflow,
    DEFAULT_USER,
)
from backend.schemas.tasks import (
    BulkCompleteOut,
    ClassEventCreateIn,
    ClassEventOut,
    CopilotJobCreateIn,
    CopilotJobOut,
    CopilotSettingsOut,
    CopilotSettingsUpdateIn,
    LmsConnectionCreateIn,
    LmsConnectionOut,
    TaskActionOut,
    TaskCountsOut,
    TaskCreateIn,
    TaskDeleteOut,
    TaskListOut,
    TaskMetricsOut,
    TaskOut,
    TaskSubtaskSummaryOut,
    TaskUpdateIn,
    WorkflowListOut,
    WorkflowOut,
)

logger = logging.getLogger(__name__)

PRIORITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "normal": 3}
PRIORITY_FILTER_VALUES = ("all", "urgent", "high", "medium", "normal")


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


def _now() -> datetime:
    return datetime.utcnow()


def _priority_order():
    return case(
        (Task.priority == "urgent", 0),
        (Task.priority == "high", 1),
        (Task.priority == "medium", 2),
        else_=3,
    )


def _due_tone(task: Task, now: datetime) -> str:
    if task.status == "done" or task.schedule_kind == "continuous" or task.due_at is None:
        return "future"
    if task.due_at < now:
        return "overdue"
    if task.due_at.date() == now.date():
        return "today"
    return "future"


def _due_label(task: Task, now: datetime) -> str:
    if task.status == "done" and task.completed_at is not None:
        if task.completed_at.date() == now.date():
            return "Done today"
        if task.completed_at.date() == (now - timedelta(days=1)).date():
            return "Done yesterday"
        return f"Done {task.completed_at:%b} {task.completed_at.day}"
    if task.schedule_kind == "continuous" or task.due_at is None:
        return "Continuous Sync"
    if task.due_at.date() == now.date():
        return f"Today, {_time_label(task.due_at)}"
    if task.due_at.date() == (now + timedelta(days=1)).date():
        return f"Tomorrow, {_time_label(task.due_at)}"
    return f"{task.due_at:%b} {task.due_at.day}"


def _time_label(value: datetime) -> str:
    return value.strftime("%I:%M %p").lstrip("0")


def _due_rank(task: Task, now: datetime) -> int:
    if task.status == "done":
        return 10_000
    if task.schedule_kind == "continuous" or task.due_at is None:
        return 9_999
    return max(0, int((task.due_at - now).total_seconds() // 60))


async def _tasks_by_ids(db: AsyncSession, ids: list[str]) -> dict[str, Task]:
    if not ids:
        return {}
    rows = (await db.execute(select(Task).where(Task.id.in_(ids)))).scalars().all()
    return {row.id: row for row in rows}


async def _tag_map(db: AsyncSession, task_ids: list[str]) -> dict[str, list[str]]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(TaskTagLink.task_id, TaskTag.name)
            .join(TaskTag, TaskTag.id == TaskTagLink.tag_id)
            .where(TaskTagLink.task_id.in_(task_ids))
            .order_by(TaskTag.name)
        )
    ).all()
    out: dict[str, list[str]] = {}
    for task_id, name in rows:
        out.setdefault(task_id, []).append(name)
    return out


async def _subtask_map(db: AsyncSession, task_ids: list[str]) -> dict[str, TaskSubtaskSummaryOut]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(
                TaskSubtask.task_id,
                func.count(TaskSubtask.id),
                func.coalesce(func.sum(case((TaskSubtask.is_done, 1), else_=0)), 0),
            )
            .where(TaskSubtask.task_id.in_(task_ids))
            .group_by(TaskSubtask.task_id)
        )
    ).all()
    return {
        task_id: TaskSubtaskSummaryOut(done=int(done or 0), total=int(total or 0))
        for task_id, total, done in rows
    }


def _task_out(task: Task, tags: list[str], subtask: TaskSubtaskSummaryOut | None, now: datetime) -> TaskOut:
    group = task.group_key if task.group_key in ("today", "upcoming") else "upcoming"
    return TaskOut(
        id=task.id,
        title=task.title,
        priority=task.priority,  # type: ignore[arg-type]
        tags=tags,
        due=_due_label(task, now),
        dueTone=_due_tone(task, now),  # type: ignore[arg-type]
        dueRank=_due_rank(task, now),
        subtask=subtask,
        note=task.note,
        action=TaskActionOut(label=task.action_label, kind=task.action_kind),  # type: ignore[arg-type]
        group=group,  # type: ignore[arg-type]
        completed=task.status == "done",
    )


async def _resolve_tags(db: AsyncSession, names: list[str]) -> list[TaskTag]:
    clean = [name.strip() for name in names if name.strip()]
    if not clean:
        return []
    existing_rows = (await db.execute(select(TaskTag).where(TaskTag.name.in_(clean)))).scalars().all()
    by_name = {row.name: row for row in existing_rows}
    created: list[TaskTag] = []
    for name in clean:
        if name not in by_name:
            row = TaskTag(id=f"tag-{uuid4().hex[:12]}", name=name)
            db.add(row)
            created.append(row)
            by_name[name] = row
    if created:
        await db.flush()
    return [by_name[name] for name in clean]


async def _sync_tags(db: AsyncSession, task_id: str, names: list[str]) -> None:
    tags = await _resolve_tags(db, names)
    await db.execute(delete(TaskTagLink).where(TaskTagLink.task_id == task_id))
    for tag in tags:
        db.add(TaskTagLink(task_id=task_id, tag_id=tag.id))


async def get_task_or_404(db: AsyncSession, task_id: str) -> Task:
    task = await db.get(Task, task_id)
    if task is None or task.user_id != DEFAULT_USER:
        raise NotFound(f"Task {task_id} tidak ditemukan")
    return task


async def list_tasks(
    db: AsyncSession,
    *,
    query: str = "",
    sidebar_query: str = "",
    priority: str = "all",
    sort: str = "due",
    quick: str | None = None,
) -> TaskListOut:
    now = _now()
    stmt = select(Task).where(Task.user_id == DEFAULT_USER)
    if priority in PRIORITY_FILTER_VALUES and priority != "all":
        stmt = stmt.where(Task.priority == priority)
    if quick == "priority":
        stmt = stmt.where(Task.priority.in_(("urgent", "high")))
    elif quick == "due":
        stmt = stmt.where(Task.group_key == "today")
    elif quick == "my":
        pass
    for candidate in (query.strip().lower(), sidebar_query.strip().lower()):
        if not candidate:
            continue
        pattern = f"%{candidate}%"
        tag_exists = (
            select(TaskTagLink.task_id)
            .join(TaskTag, TaskTag.id == TaskTagLink.tag_id)
            .where(TaskTagLink.task_id == Task.id, func.lower(TaskTag.name).like(pattern))
        )
        stmt = stmt.where(
            or_(
                func.lower(Task.title).like(pattern),
                func.lower(func.coalesce(Task.note, "")).like(pattern),
                tag_exists.exists(),
            )
        )
    if sort == "name":
        stmt = stmt.order_by(Task.title)
    elif sort == "priority":
        stmt = stmt.order_by(_priority_order(), Task.due_at)
    else:
        stmt = stmt.order_by(Task.due_at.is_(None), Task.due_at, _priority_order())
    rows = (await db.execute(stmt)).scalars().all()
    tags = await _tag_map(db, [row.id for row in rows])
    subtasks = await _subtask_map(db, [row.id for row in rows])
    items = [_task_out(row, tags.get(row.id, []), subtasks.get(row.id), now) for row in rows]

    all_rows = (
        await db.execute(select(Task).where(Task.user_id == DEFAULT_USER))
    ).scalars().all()
    counts = TaskCountsOut(
        my=len(all_rows),
        priority=sum(1 for row in all_rows if row.priority in ("urgent", "high")),
        due=sum(1 for row in all_rows if row.group_key == "today"),
    )
    week_ago = now - timedelta(days=7)
    metrics = TaskMetricsOut(
        activeWorkload=sum(1 for row in all_rows if row.status == "open"),
        activeWorkloadCreatedToday=sum(
            1 for row in all_rows if row.status == "open" and row.created_at.date() == now.date()
        ),
        completedThisWeek=sum(
            1
            for row in all_rows
            if row.status == "done" and row.completed_at is not None and row.completed_at >= week_ago
        ),
        dueToday=sum(
            1
            for row in all_rows
            if row.status == "open"
            and row.due_at is not None
            and row.due_at.date() == now.date()
        ),
        dueTodayUrgent=sum(
            1
            for row in all_rows
            if row.status == "open"
            and row.priority == "urgent"
            and row.due_at is not None
            and row.due_at.date() == now.date()
        ),
        semesterTotal=len(all_rows),
        semesterDone=sum(1 for row in all_rows if row.status == "done"),
        semesterCompletion=(
            round(100 * sum(1 for row in all_rows if row.status == "done") / len(all_rows))
            if all_rows
            else 0
        ),
    )
    return TaskListOut(items=items, counts=counts, metrics=metrics)


async def create_task(db: AsyncSession, payload: TaskCreateIn) -> TaskOut:
    now = _now()
    row = Task(
        id=f"t-{uuid4().hex[:12]}",
        user_id=DEFAULT_USER,
        title=payload.title.strip(),
        note=payload.note,
        priority=payload.priority,
        group_key=payload.group,
        status="open",
        source=payload.source,
        workflow_id=payload.workflowId,
        due_at=payload.dueAt,
        schedule_kind=payload.scheduleKind,
        action_label=payload.actionLabel,
        action_kind=payload.actionKind,
        action_url=payload.actionUrl,
    )
    db.add(row)
    await db.flush()
    await _sync_tags(db, row.id, payload.tags)
    await db.commit()
    tags = await _tag_map(db, [row.id])
    subtasks = await _subtask_map(db, [row.id])
    return _task_out(row, tags.get(row.id, []), subtasks.get(row.id), now)


async def update_task(db: AsyncSession, task_id: str, payload: TaskUpdateIn) -> TaskOut:
    row = await get_task_or_404(db, task_id)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        row.title = data["title"].strip()
    if "priority" in data:
        row.priority = data["priority"]
    if "group" in data:
        row.group_key = data["group"]
    if "status" in data:
        row.status = data["status"]
        row.completed_at = _now() if data["status"] == "done" else None
    if "dueAt" in data:
        row.due_at = data["dueAt"]
    if "scheduleKind" in data:
        row.schedule_kind = data["scheduleKind"]
    if "note" in data:
        row.note = data["note"]
    if "workflowId" in data:
        row.workflow_id = data["workflowId"]
    if "actionLabel" in data:
        row.action_label = data["actionLabel"]
    if "actionKind" in data:
        row.action_kind = data["actionKind"]
    if "actionUrl" in data:
        row.action_url = data["actionUrl"]
    if "tags" in data and data["tags"] is not None:
        await _sync_tags(db, row.id, data["tags"])
    await db.commit()
    tags = await _tag_map(db, [row.id])
    subtasks = await _subtask_map(db, [row.id])
    return _task_out(row, tags.get(row.id, []), subtasks.get(row.id), _now())


async def toggle_task(db: AsyncSession, task_id: str) -> TaskOut:
    row = await get_task_or_404(db, task_id)
    if row.status == "done":
        row.status = "open"
        row.completed_at = None
    else:
        row.status = "done"
        row.completed_at = _now()
    await db.commit()
    tags = await _tag_map(db, [row.id])
    subtasks = await _subtask_map(db, [row.id])
    return _task_out(row, tags.get(row.id, []), subtasks.get(row.id), _now())


async def delete_task(db: AsyncSession, task_id: str) -> TaskDeleteOut:
    row = await get_task_or_404(db, task_id)
    await db.delete(row)
    await db.commit()
    return TaskDeleteOut(deleted=True)


async def bulk_complete(
    db: AsyncSession, *, query: str = "", sidebar_query: str = "", priority: str = "all"
) -> BulkCompleteOut:
    stmt = select(Task).where(Task.user_id == DEFAULT_USER, Task.status == "open")
    if priority != "all":
        stmt = stmt.where(Task.priority == priority)
    for candidate in (query.strip().lower(), sidebar_query.strip().lower()):
        if not candidate:
            continue
        pattern = f"%{candidate}%"
        stmt = stmt.where(
            or_(
                func.lower(Task.title).like(pattern),
                func.lower(func.coalesce(Task.note, "")).like(pattern),
            )
        )
    rows = (await db.execute(stmt)).scalars().all()
    now = _now()
    for row in rows:
        row.status = "done"
        row.completed_at = now
    await db.commit()
    return BulkCompleteOut(completed=len(rows))


async def list_workflows(db: AsyncSession) -> WorkflowListOut:
    rows = (
        await db.execute(
            select(
                TaskWorkflow,
                func.count(Task.id),
            )
            .outerjoin(Task, (Task.workflow_id == TaskWorkflow.id) & (Task.status == "open"))
            .where(TaskWorkflow.is_active == True)  # noqa: E712
            .group_by(TaskWorkflow.id)
            .order_by(TaskWorkflow.sort_order, TaskWorkflow.name)
        )
    ).all()
    return WorkflowListOut(
        items=[
            WorkflowOut(id=wf.id, label=wf.name, count=str(count or 0), dot=wf.dot_tone)
            for wf, count in rows
        ]
    )


async def get_or_create_copilot_settings(db: AsyncSession) -> CopilotSetting:
    row = await db.get(CopilotSetting, "default")
    if row is None:
        row = CopilotSetting(id="default")
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def get_copilot_settings(db: AsyncSession) -> CopilotSettingsOut:
    row = await get_or_create_copilot_settings(db)
    return CopilotSettingsOut(
        enabled=row.enabled,
        autoOrganize=row.auto_organize,
        optimizeExamWeek=row.optimize_exam_week,
        syncLmsDiscussions=row.sync_lms_discussions,
        syncClassSchedule=row.sync_class_schedule,
        providerHint=row.provider_hint,
    )


async def update_copilot_settings(
    db: AsyncSession, payload: CopilotSettingsUpdateIn
) -> CopilotSettingsOut:
    row = await get_or_create_copilot_settings(db)
    data = payload.model_dump(exclude_unset=True)
    row.enabled = data.get("enabled", row.enabled)
    row.auto_organize = data.get("autoOrganize", row.auto_organize)
    row.optimize_exam_week = data.get("optimizeExamWeek", row.optimize_exam_week)
    row.sync_lms_discussions = data.get("syncLmsDiscussions", row.sync_lms_discussions)
    row.sync_class_schedule = data.get("syncClassSchedule", row.sync_class_schedule)
    row.provider_hint = data.get("providerHint", row.provider_hint)
    await db.commit()
    return await get_copilot_settings(db)


async def create_copilot_job(db: AsyncSession, payload: CopilotJobCreateIn) -> CopilotJobOut:
    row = CopilotJob(id=f"job-{uuid4().hex[:12]}", kind=payload.kind, status="queued")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return CopilotJobOut(id=row.id, kind=row.kind, status=row.status, createdAt=row.created_at)


async def list_lms_connections(db: AsyncSession) -> list[LmsConnectionOut]:
    rows = (
        await db.execute(
            select(LmsConnection)
            .where(LmsConnection.is_active == True)  # noqa: E712
            .order_by(LmsConnection.name)
        )
    ).scalars().all()
    return [
        LmsConnectionOut(
            id=row.id,
            provider=row.provider,
            name=row.name,
            baseUrl=row.base_url,
            isActive=row.is_active,
            lastSyncedAt=row.last_synced_at,
        )
        for row in rows
    ]


async def create_lms_connection(db: AsyncSession, payload: LmsConnectionCreateIn) -> LmsConnectionOut:
    row = LmsConnection(
        id=f"lms-{uuid4().hex[:12]}",
        provider=payload.provider,
        name=payload.name,
        base_url=payload.baseUrl,
        auth_ref=payload.authRef,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return LmsConnectionOut(
        id=row.id,
        provider=row.provider,
        name=row.name,
        baseUrl=row.base_url,
        isActive=row.is_active,
        lastSyncedAt=row.last_synced_at,
    )


async def list_class_events(db: AsyncSession) -> list[ClassEventOut]:
    rows = (await db.execute(select(ClassEvent).order_by(ClassEvent.starts_at))).scalars().all()
    return [
        ClassEventOut(
            id=row.id,
            offeringId=row.offering_id,
            title=row.title,
            startsAt=row.starts_at,
            endsAt=row.ends_at,
            location=row.location,
            meetingUrl=row.meeting_url,
            source=row.source,
        )
        for row in rows
    ]


async def create_class_event(db: AsyncSession, payload: ClassEventCreateIn) -> ClassEventOut:
    if payload.endsAt <= payload.startsAt:
        raise ValueError("endsAt harus lebih besar dari startsAt")
    row = ClassEvent(
        id=f"evt-{uuid4().hex[:12]}",
        offering_id=payload.offeringId,
        title=payload.title,
        starts_at=payload.startsAt,
        ends_at=payload.endsAt,
        location=payload.location,
        meeting_url=payload.meetingUrl,
        source=payload.source,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ClassEventOut(
        id=row.id,
        offeringId=row.offering_id,
        title=row.title,
        startsAt=row.starts_at,
        endsAt=row.ends_at,
        location=row.location,
        meetingUrl=row.meeting_url,
        source=row.source,
    )
