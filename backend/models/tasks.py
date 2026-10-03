"""ORM tugas & copilot.

Tabel ini menggantikan mock di `src/data/tasks.ts` bertahap. Prinsipnya sama
seperti `backend/models/course.py`:
- Tidak memakai `relationship()`. Query di service memakai join eksplisit agar
  tidak ada lazy-load tersembunyi pada SQLAlchemy async.
- Enum disimpan sebagai `CheckConstraint`, bukan `Enum` native, karena enum
  SQLite tidak punya validasi database asli.
- Angka UI (quick-view counts, metrics, due tone) dihitung di service, bukan
  disimpan, supaya tidak basi.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

DEFAULT_USER = "mahasiswa"

TASK_PRIORITIES = ("urgent", "high", "medium", "normal")
TASK_GROUPS = ("today", "upcoming", "archive")
TASK_STATUSES = ("open", "done")
SCHEDULE_KINDS = ("deadline", "continuous", "done")
ACTION_KINDS = ("open", "comment")
COPILOT_JOB_KINDS = (
    "optimize_schedule",
    "read_lms_discussions",
    "sync_class_schedule",
    "generate_tasks",
)
COPILOT_JOB_STATUSES = ("queued", "running", "success", "failed")
LMS_PROVIDERS = ("moodle", "google_classroom", "canvas", "manual")
LMS_IMPORT_KINDS = ("discussion", "assignment", "announcement", "material")
LMS_IMPORT_STATUSES = ("imported", "skipped", "failed")
CLASS_EVENT_SOURCES = ("manual", "lms", "google_calendar")


class TaskWorkflow(Base):
    """Pipeline/workflow tampil di sidebar Tasks."""

    __tablename__ = "task_workflows"
    __table_args__ = (
        UniqueConstraint("name", name="uq_task_workflows_name"),
        CheckConstraint("is_active IN (0, 1)", name="ck_task_workflows_active"),
        Index("ix_task_workflows_active_sort", "is_active", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    dot_tone: Mapped[str] = mapped_column(String(32), default="secondary")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class Task(Base):
    """Satu item dari halaman Tasks."""

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(f"priority IN {TASK_PRIORITIES!r}", name="ck_tasks_priority"),
        CheckConstraint(f"group_key IN {TASK_GROUPS!r}", name="ck_tasks_group"),
        CheckConstraint(f"status IN {TASK_STATUSES!r}", name="ck_tasks_status"),
        CheckConstraint(f"schedule_kind IN {SCHEDULE_KINDS!r}", name="ck_tasks_schedule"),
        CheckConstraint(f"action_kind IN {ACTION_KINDS!r}", name="ck_tasks_action_kind"),
        CheckConstraint(f"source IN ('manual','lms','copilot')", name="ck_tasks_source"),
        Index("ix_tasks_user_status_due", "user_id", "status", "due_at"),
        Index("ix_tasks_group_priority", "group_key", "priority"),
        Index("ix_tasks_workflow", "workflow_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), default=DEFAULT_USER)
    title: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    group_key: Mapped[str] = mapped_column(String(16), default="today")
    status: Mapped[str] = mapped_column(String(16), default="open")
    source: Mapped[str] = mapped_column(String(16), default="manual")
    workflow_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("task_workflows.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    schedule_kind: Mapped[str] = mapped_column(String(16), default="deadline")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    action_label: Mapped[str] = mapped_column(String(64), default="Open Document")
    action_kind: Mapped[str] = mapped_column(String(16), default="open")
    action_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class TaskTag(Base):
    """Tag normalisasi; `#Database` dan `#database` sebaiknya jadi satu."""

    __tablename__ = "task_tags"
    __table_args__ = (UniqueConstraint("name", name="uq_task_tags_name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class TaskTagLink(Base):
    __tablename__ = "task_tag_links"
    __table_args__ = (
        PrimaryKeyConstraint("task_id", "tag_id", name="pk_task_tag_links"),
        Index("ix_task_tag_links_tag", "tag_id"),
    )

    task_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tasks.id", ondelete="CASCADE")
    )
    tag_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("task_tags.id", ondelete="CASCADE")
    )


class TaskSubtask(Base):
    __tablename__ = "task_subtasks"
    __table_args__ = (
        CheckConstraint("is_done IN (0, 1)", name="ck_task_subtasks_done"),
        Index("ix_task_subtasks_task_done", "task_id", "is_done"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tasks.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255))
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class CopilotSetting(Base):
    """Satu baris pengaturan copilot pribadi."""

    __tablename__ = "copilot_settings"

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default="default")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_organize: Mapped[bool] = mapped_column(Boolean, default=False)
    optimize_exam_week: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_lms_discussions: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_class_schedule: Mapped[bool] = mapped_column(Boolean, default=False)
    provider_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class LmsConnection(Base):
    __tablename__ = "lms_connections"
    __table_args__ = (
        CheckConstraint(f"provider IN {LMS_PROVIDERS!r}", name="ck_lms_connections_provider"),
        Index("ix_lms_connections_active", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), default="manual")
    name: Mapped[str] = mapped_column(String(128))
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class LmsImport(Base):
    __tablename__ = "lms_imports"
    __table_args__ = (
        UniqueConstraint("connection_id", "external_id", name="uq_lms_imports_external"),
        CheckConstraint(f"kind IN {LMS_IMPORT_KINDS!r}", name="ck_lms_imports_kind"),
        CheckConstraint(f"status IN {LMS_IMPORT_STATUSES!r}", name="ck_lms_imports_status"),
        Index("ix_lms_imports_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    connection_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("lms_connections.id", ondelete="CASCADE")
    )
    external_id: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(24))
    title: Mapped[str] = mapped_column(String(255))
    task_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="skipped")
    raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class ClassEvent(Base):
    __tablename__ = "class_events"
    __table_args__ = (
        CheckConstraint(f"source IN {CLASS_EVENT_SOURCES!r}", name="ck_class_events_source"),
        CheckConstraint("ends_at > starts_at", name="ck_class_events_range"),
        Index("ix_class_events_starts", "starts_at"),
        Index("ix_class_events_offering", "offering_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    offering_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("course_offerings.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meeting_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class CopilotJob(Base):
    __tablename__ = "copilot_jobs"
    __table_args__ = (
        CheckConstraint(f"kind IN {COPILOT_JOB_KINDS!r}", name="ck_copilot_jobs_kind"),
        CheckConstraint(f"status IN {COPILOT_JOB_STATUSES!r}", name="ck_copilot_jobs_status"),
        Index("ix_copilot_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
