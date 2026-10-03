"""Skema request/response untuk endpoint Tasks & Copilot.

Prinsipnya sama dengan `schemas/courses.py`: bentuk JSON sengaja meniru tipe
frontend (`src/data/tasks.ts`) supaya `TaskCard.tsx` tidak perlu diubah dulu.
Field camelCase memakai `alias=`; Python tetap memakai snake_case.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TaskPriority = Literal["urgent", "high", "medium", "normal"]
TaskGroup = Literal["today", "upcoming", "archive"]
TaskStatus = Literal["open", "done"]
DueTone = Literal["overdue", "today", "future"]
TaskActionKind = Literal["open", "comment"]
TaskActionKindReq = Literal["open", "comment"]
TaskScheduleKind = Literal["deadline", "continuous", "done"]
TaskSource = Literal["manual", "lms", "copilot"]
TasksSort = Literal["due", "priority", "name"]
PriorityFilter = Literal["all", "urgent", "high", "medium", "normal"]
QuickViewId = Literal["my", "priority", "due"]


class TaskActionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    kind: TaskActionKind


class TaskSubtaskSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    done: int = 0
    total: int = 0


class TaskOut(BaseModel):
    """Bentuk yang consumed `TaskCard.tsx`."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    priority: TaskPriority
    tags: list[str] = Field(default_factory=list)
    due: str
    dueTone: DueTone = Field(alias="dueTone")
    dueRank: int = Field(alias="dueRank")
    subtask: TaskSubtaskSummaryOut | None = None
    note: str | None = None
    action: TaskActionOut
    group: TaskGroup = Field(alias="group")
    completed: bool


class TaskCountsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    my: int = 0
    priority: int = 0
    due: int = 0


class TaskMetricsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    activeWorkload: int = Field(alias="activeWorkload", default=0)
    activeWorkloadCreatedToday: int = Field(alias="activeWorkloadCreatedToday", default=0)
    completedThisWeek: int = Field(alias="completedThisWeek", default=0)
    dueToday: int = Field(alias="dueToday", default=0)
    dueTodayUrgent: int = Field(alias="dueTodayUrgent", default=0)
    semesterCompletion: int = Field(alias="semesterCompletion", default=0)
    semesterDone: int = Field(alias="semesterDone", default=0)
    semesterTotal: int = Field(alias="semesterTotal", default=0)


class TaskListOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[TaskOut] = Field(default_factory=list)
    counts: TaskCountsOut = Field(default_factory=TaskCountsOut)
    metrics: TaskMetricsOut = Field(default_factory=TaskMetricsOut)


class TaskCreateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=255)
    priority: TaskPriority = "normal"
    group: TaskGroup = "today"
    dueAt: datetime | None = Field(alias="dueAt", default=None)
    scheduleKind: TaskScheduleKind = Field(alias="scheduleKind", default="deadline")
    note: str | None = None
    tags: list[str] = Field(default_factory=list)
    workflowId: str | None = Field(alias="workflowId", default=None)
    actionLabel: str = Field(alias="actionLabel", default="Open Document")
    actionKind: TaskActionKindReq = Field(alias="actionKind", default="open")
    actionUrl: str | None = Field(alias="actionUrl", default=None)
    source: TaskSource = "manual"


class TaskUpdateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = Field(default=None, min_length=1, max_length=255)
    priority: TaskPriority | None = None
    group: TaskGroup | None = None
    status: TaskStatus | None = None
    dueAt: datetime | None = Field(alias="dueAt", default=None)
    scheduleKind: TaskScheduleKind | None = Field(alias="scheduleKind", default=None)
    note: str | None = None
    tags: list[str] | None = None
    workflowId: str | None = Field(alias="workflowId", default=None)
    actionLabel: str | None = Field(alias="actionLabel", default=None)
    actionKind: TaskActionKindReq | None = Field(alias="actionKind", default=None)
    actionUrl: str | None = Field(alias="actionUrl", default=None)


class TaskDeleteOut(BaseModel):
    deleted: bool


class BulkCompleteOut(BaseModel):
    completed: int


class WorkflowOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    label: str
    count: str
    dot: str


class WorkflowListOut(BaseModel):
    items: list[WorkflowOut] = Field(default_factory=list)


class CopilotSettingsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    autoOrganize: bool = Field(alias="autoOrganize")
    optimizeExamWeek: bool = Field(alias="optimizeExamWeek")
    syncLmsDiscussions: bool = Field(alias="syncLmsDiscussions")
    syncClassSchedule: bool = Field(alias="syncClassSchedule")
    providerHint: str | None = Field(alias="providerHint", default=None)


class CopilotSettingsUpdateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool | None = None
    autoOrganize: bool | None = Field(alias="autoOrganize", default=None)
    optimizeExamWeek: bool | None = Field(alias="optimizeExamWeek", default=None)
    syncLmsDiscussions: bool | None = Field(alias="syncLmsDiscussions", default=None)
    syncClassSchedule: bool | None = Field(alias="syncClassSchedule", default=None)
    providerHint: str | None = Field(alias="providerHint", default=None)


class LmsConnectionCreateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: Literal["moodle", "google_classroom", "canvas", "manual"] = "manual"
    name: str = Field(min_length=1, max_length=128)
    baseUrl: str | None = Field(alias="baseUrl", default=None)
    authRef: str | None = Field(alias="authRef", default=None)


class LmsConnectionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    provider: str
    name: str
    baseUrl: str | None = Field(alias="baseUrl", default=None)
    isActive: bool = Field(alias="isActive")
    lastSyncedAt: datetime | None = Field(alias="lastSyncedAt", default=None)


class ClassEventCreateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    offeringId: str | None = Field(alias="offeringId", default=None)
    title: str = Field(min_length=1, max_length=255)
    startsAt: datetime = Field(alias="startsAt")
    endsAt: datetime = Field(alias="endsAt")
    location: str | None = None
    meetingUrl: str | None = Field(alias="meetingUrl", default=None)
    source: Literal["manual", "lms", "google_calendar"] = "manual"


class ClassEventOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    offeringId: str | None = Field(alias="offeringId", default=None)
    title: str
    startsAt: datetime = Field(alias="startsAt")
    endsAt: datetime = Field(alias="endsAt")
    location: str | None = None
    meetingUrl: str | None = Field(alias="meetingUrl", default=None)
    source: str


class CopilotJobCreateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: Literal[
        "optimize_schedule",
        "read_lms_discussions",
        "sync_class_schedule",
        "generate_tasks",
    ]


class CopilotJobOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    kind: str
    status: str
    createdAt: datetime = Field(alias="createdAt")
