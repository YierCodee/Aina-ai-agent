"""Environment Alembic.

Tiga hal yang perlu diperhatikan di file ini:

1. **Async engine.** Database aplikasi pakai `sqlite+aiosqlite`, jadi Alembic
   harus `run_async_migrations()` lewat `asyncio` + `connection.run_sync`. Versi
   sinkron biasa akan gagal dengan "no such table" yang sangat menyesatkan.

2. **URL dari settings, bukan dari alembic.ini.** `settings.database_url` sudah
   dipahami `backend/.env` dan override env. Kalau URL ditulis dua kali,윗경로
   yang berbeda akan dipakai depending di mana Alembic dijalankan.

3. **`compare_type=True`.** Tanpa ini, perubahan `VARCHAR(32)` -> `VARCHAR(64)`
   atau `BOOLEAN` -> `INTEGER` tidak pernah menghasilkan revision.
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from backend.core.config import settings
from backend.core.database import Base

# Model harus di-import supaya Base.metadata terisi penuh. Tanpa ini,
# `alembic revision --autogenerate` menghasilkan revision kosong tanpa error.
import backend.models.chat  # noqa: F401,E402
import backend.models.course  # noqa: F401,E402
import backend.models.tasks  # noqa: F401,E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Khasilkan SQL tanpa terhubung ke database (`alembic upgrade head --sql`)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=True,  # SQLite tidak punya ALTER COLUMN
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        # SQLite butuh mode batch untukALTER TABLE yang tidak didukung native.
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()