"""Endpoint Tasks & Copilot.

Router tipis; semua query dan formatting di `services/task_service.py`.
Registrasi di `backend/main.py` agar tersedia sejak startup sidecar.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
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
    PriorityFilter,
    QuickViewId,
    TaskCreateIn,
    TaskDeleteOut,
    TaskListOut,
    TaskOut,
    TasksSort,
    TaskUpdateIn,
    WorkflowListOut,
)
from backend.services import task_service as svc

router = APIRouter(prefix="/api", tags=["tasks"])


def _not_found(exc: svc.NotFound) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


_CONFLICTS: tuple[tuple[str, int, str, bool], ...] = (
    ("task_workflows.name", 409, "Nama workflow sudah dipakai.", False),
    ("task_tags.name", 409, "Tag sudah ada.", False),
    ("tasks.workflow_id", 422, "Workflow tidak ditemukan — muat ulang halaman.", False),
    ("lms_connections", 422, "Koneksi LMS tidak ditemukan — muat ulang halaman.", False),
    ("CHECK constraint failed", 422, "Nilai ada yang di luar rentang yang diizinkan.", False),
    ("FOREIGN KEY constraint failed", 422, "Relasi tidak ditemukan — muat ulang halaman.", False),
)


def _conflict(exc: IntegrityError) -> HTTPException:
    msg = str(exc.orig) if exc.orig else str(exc)
    for needle, code, detail, _internal in _CONFLICTS:
        if needle in msg:
            return HTTPException(status_code=code, detail=detail)
    return HTTPException(status_code=422, detail="Database menolak data tersebut.")


@router.get("/tasks", response_model=TaskListOut)
async def get_tasks(
    query: str = Query(default=""),
    sidebar_query: str = Query(default=""),
    priority: PriorityFilter = Query(default="all"),
    sort: TasksSort = Query(default="due"),
    quick: QuickViewId | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> TaskListOut:
    return await svc.list_tasks(
        db, query=query, sidebar_query=sidebar_query, priority=priority, sort=sort, quick=quick
    )


@router.post("/tasks", response_model=TaskOut)
async def post_task(payload: TaskCreateIn, db: AsyncSession = Depends(get_db)) -> TaskOut:
    try:
        return await svc.create_task(db, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from exc


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def patch_task(task_id: str, payload: TaskUpdateIn, db: AsyncSession = Depends(get_db)) -> TaskOut:
    try:
        return await svc.update_task(db, task_id, payload)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from exc


@router.post("/tasks/{task_id}/toggle", response_model=TaskOut)
async def toggle_task(task_id: str, db: AsyncSession = Depends(get_db)) -> TaskOut:
    try:
        return await svc.toggle_task(db, task_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc


@router.delete("/tasks/{task_id}", response_model=TaskDeleteOut)
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)) -> TaskDeleteOut:
    try:
        return await svc.delete_task(db, task_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/tasks/bulk-complete", response_model=BulkCompleteOut)
async def bulk_complete_tasks(
    query: str = Query(default=""),
    sidebar_query: str = Query(default=""),
    priority: PriorityFilter = Query(default="all"),
    db: AsyncSession = Depends(get_db),
) -> BulkCompleteOut:
    return await svc.bulk_complete(db, query=query, sidebar_query=sidebar_query, priority=priority)


@router.get("/tasks/workflows", response_model=WorkflowListOut)
async def get_task_workflows(db: AsyncSession = Depends(get_db)) -> WorkflowListOut:
    return await svc.list_workflows(db)


@router.get("/tasks/copilot/settings", response_model=CopilotSettingsOut)
async def get_copilot_settings(db: AsyncSession = Depends(get_db)) -> CopilotSettingsOut:
    return await svc.get_copilot_settings(db)


@router.patch("/tasks/copilot/settings", response_model=CopilotSettingsOut)
async def patch_copilot_settings(
    payload: CopilotSettingsUpdateIn, db: AsyncSession = Depends(get_db)
) -> CopilotSettingsOut:
    return await svc.update_copilot_settings(db, payload)


@router.post("/tasks/copilot/jobs", response_model=CopilotJobOut)
async def post_copilot_job(payload: CopilotJobCreateIn, db: AsyncSession = Depends(get_db)) -> CopilotJobOut:
    return await svc.create_copilot_job(db, payload)


@router.get("/tasks/lms/connections", response_model=list[LmsConnectionOut])
async def get_lms_connections(db: AsyncSession = Depends(get_db)) -> list[LmsConnectionOut]:
    return await svc.list_lms_connections(db)


@router.post("/tasks/lms/connections", response_model=LmsConnectionOut)
async def post_lms_connection(payload: LmsConnectionCreateIn, db: AsyncSession = Depends(get_db)) -> LmsConnectionOut:
    try:
        return await svc.create_lms_connection(db, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from exc


@router.get("/tasks/class-events", response_model=list[ClassEventOut])
async def get_class_events(db: AsyncSession = Depends(get_db)) -> list[ClassEventOut]:
    return await svc.list_class_events(db)


@router.post("/tasks/class-events", response_model=ClassEventOut)
async def post_class_event(payload: ClassEventCreateIn, db: AsyncSession = Depends(get_db)) -> ClassEventOut:
    try:
        return await svc.create_class_event(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from exc
