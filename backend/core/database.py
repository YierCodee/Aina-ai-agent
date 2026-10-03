"""Engine + session SQLite untuk riwayat chat.

Satu file ini menjadi titik masuk DB milik aplikasi:
- `init_db()` dipanggil sekali saat startup FastAPI (lihat `main.py`).
- `get_db()` dipakai sebagai dependency FastAPI / manual di service.
- WAL + foreign_keys diaktifkan agar aman dipakai bareng sidecar Tauri.

Perubahan skema TIDAK dilakukan di sini. `init_db()` tidak lagi memanggil
`create_all` — itukedua sumber kebenaran dengan Alembic dan bisa membuat tabel
yang revisi Alembic tidak kenal. Migrasi dijalankan lewat `alembic upgrade head`
(lihat `backend/migrations/`), sedangkan runtime hanya memverifikasi versi.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import MetaData, event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

# Naming convention WAJIB untuk Alembic. Tanpa ini, FK yang dibuat lewat
# `ForeignKey(...)` tanpa `name=` tetap unnamed, dan `alembic revision
# --autogenerate` akan menghasilkan `drop_constraint(None, ...)` di downgrade —
# yang tidak tahu constraint mana yang dimaksud dan gagal saat dijalankan.
# Convention hanya mengisi nama yang tidakgiven; constraint yang sudah bernama
# eksplisit (semua CHECK/INDEX di models) tidak tersentuh.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base ORM untuk semua tabel milik aplikasi."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# Revisi skema yang diharapkan aplikasi ini. Naikkan setiap kali menambah
# revision di backend/migrations/versions. Nilainya di-hardcode di sini dengan
# sengaja: inilah yang diperiksa runtime, bukan membacanya dari disk — di dalam
# bundle PyInstaller onefile, migrations tidak selalu ikut terbaca.
SCHEMA_REVISION = "0003_tasks_copilot"

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


@dataclass(frozen=True)
class SchemaStatus:
    """Hasil pemeriksaan versi skema terhadap SCHEMA_REVISION."""

    expected: str
    current: str | None
    ok: bool
    message: str


def _sqlite_file_from_url(url: str) -> Path | None:
    """Ambil path file dari URL sqlite. Return None untuk :memory:."""
    # Bentuk: sqlite+aiosqlite:///./data/app.db atau sqlite:///./data/x.db
    if ":memory:" in url:
        return None
    path_part = url.split(":///", 1)[-1].split("?", 1)[0]
    return Path(path_part)


def _ensure_parent_dir(url: str) -> None:
    path = _sqlite_file_from_url(url)
    if path is None:
        return
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def _is_sqlite_url(url: str) -> bool:
    return url.startswith("sqlite")


def get_engine() -> AsyncEngine:
    """Buat sekali lalu pakai ulang. Lazy agar import tidak menyentuh disk."""
    global _engine, _session_factory
    if _engine is not None:
        return _engine

    from backend.core.config import settings

    _ensure_parent_dir(settings.database_url)
    _engine = create_async_engine(settings.database_url, future=True)
    sync_engine = _engine.sync_engine

    if _is_sqlite_url(settings.database_url):

        @event.listens_for(sync_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _):  # noqa: ANN001, ANN202
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    _session_factory = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


async def get_db() -> AsyncSession:
    """Dependency FastAPI: `db: AsyncSession = Depends(get_db)`."""
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def check_schema_revision() -> SchemaStatus:
    """Bandingkan versi skema tersimpan dengan SCHEMA_REVISION.

    Tidak melempar exception dan tidak mengubah apa pun. Sidecar tetap harus
    start supaya `/health` bisa melaporkan masalahnya — kalau startup gagal,
    pengguna tidak diberi jalur untuk diagnosis. Yang berubah: `ok=False` dan
    `/health` ikut melapor.

    Versi dibaca lewat query biasa, bukan `inspect()`. `inspect()` membutuhkan
    objek Connection, sedangkan yang tersedia di sini AsyncSession; memakainya
    berakhir dengan NoInspectionAvailable saat startup.

    Revisi yang cocok saja TIDAK cukup. Kalau sebuah revision diedit setelah
    sempat ter-apply (mis. ditambah kolom), `alembic_version` tetap mencatat id
    yang sama padahal tabelnya tidak — persis yang terjadi saat `folder_id` dan
    `ai_tutors.avatar_tone` ditambahkan ke revisi yang sudah pernah jalan.
    Karena itu satu sentinel column per tabel juga dicek. Daftar sengaja
    pendek: tujuannya menangkap "skema salah versi", bukan memvalidasi setiap
    kolom.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            exists = (
                await session.execute(
                    text(
                        "SELECT 1 FROM sqlite_master "
                        "WHERE type='table' AND name='alembic_version'"
                    )
                )
            ).first()
            if exists is None:
                return SchemaStatus(
                    expected=SCHEMA_REVISION,
                    current=None,
                    ok=False,
                    message=(
                        "Skema belum dimigrasi. Jalankan `alembic upgrade head` "
                        "di repo sebelum memakai backend."
                    ),
                )
            row = (
                await session.execute(
                    text("SELECT version_num FROM alembic_version LIMIT 1")
                )
            ).first()
        except Exception as exc:  # noqa: BLE001
            return SchemaStatus(
                expected=SCHEMA_REVISION,
                current=None,
                ok=False,
                message=f"Tidak bisa membaca versi skema: {exc}",
            )
        current = row[0] if row else None

    if current != SCHEMA_REVISION:
        return SchemaStatus(
            expected=SCHEMA_REVISION,
            current=current,
            ok=False,
            message=(
                f"Versi skema tidak cocok: database di {current}, "
                f"aplikasi mengharapkan {SCHEMA_REVISION}. Jalankan `alembic upgrade head`."
            ),
        )

    missing = await _missing_sentinels()
    if missing:
        return SchemaStatus(
            expected=SCHEMA_REVISION,
            current=current,
            ok=False,
            message=(
                f"Skema tidak lengkap (butuh: {', '.join(missing)}). Kemungkinan "
                "revision diedit setelah sempat dijalankan. Jalankan "
                "`alembic downgrade base && alembic upgrade head`."
            ),
        )
    return SchemaStatus(
        expected=SCHEMA_REVISION, current=current, ok=True, message="Skema sesuai."
    )


# Satu kolom khas per tabel. Kalau salah satu hilang, DB-nya bukan hasil
# `alembic upgrade head` untuk revisi saat ini.
_SENTINEL_COLUMNS: tuple[tuple[str, str], ...] = (
    ("chat_sessions", "offering_id"),
    ("courses", "curriculum"),
    ("course_offerings", "class_label"),
    ("lecturers", "avatar_tone"),
    ("offering_lecturers", "is_primary"),
    ("consultation_slots", "day_of_week"),
    ("enrollments", "progress_percent"),
    ("course_weeks", "meeting_kind"),
    ("ai_tutors", "avatar_tone"),
    ("course_tutors", "rag_namespace"),
    ("course_materials", "folder_id"),
    ("material_chunks", "material_id"),
    ("material_folders", "badge_tone"),
    ("terms", "academic_year"),
)


async def _missing_sentinels() -> list[str]:
    """`table.column` yang tidak ada di database. Kosong = skema utuh.

    Pakai `PRAGMA table_info` supaya nama tabel/kolom yang salah bisa disebut
    di pesan error, bukan hanya "OperationalError".
    """
    factory = get_session_factory()
    async with factory() as session:
        missing: list[str] = []
        for table, column in _SENTINEL_COLUMNS:
            try:
                rows = (await session.execute(text(f"PRAGMA table_info({table})"))).all()
            except Exception:  # noqa: BLE001
                missing.append(f"{table} (tidak bisa dibaca)")
                continue
            names = {r[1] for r in rows}
            if not names:
                missing.append(f"{table} (tabel tidak ada)")
            elif column not in names:
                missing.append(f"{table}.{column}")
        return missing


async def init_db() -> None:
    """Siapkan engine, pastikan WAL aktif, lalu verifikasi versi skema.

    Sengaja tidak memanggil `create_all`: pembuatan tabel milik Alembic. Yang
    dilakukan di sini hanya hal yang tidak bisa dilakukan Alembic — membuat
    direktori induk file DB dan menyalakan WAL/foreign_keys.
    """
    from backend.core.config import settings

    _ensure_parent_dir(settings.database_url)

    # Import model supaya Base.metadata lengkap. Alembic autogenerate rely on
    # import yang sama; kalau lupa, revisiongenerate kosong tanpa error.
    import backend.models.chat  # noqa: F401
    import backend.models.course  # noqa: F401
    import backend.models.tasks  # noqa: F401

    factory = get_session_factory()
    if _is_sqlite_url(settings.database_url):
        async with factory() as session:
            await session.execute(text("PRAGMA journal_mode=WAL"))
            await session.commit()

    status = await check_schema_revision()
    if status.ok:
        logger.info(
            "Database siap: %s (skema %s)", settings.database_url, status.current
        )
    else:
        # Error, bukan warning: request yang menyentuh tabel baru akan gagal
        # dan `/health` akan melaporkannya sebagai tidak siap.
        logger.error("Database %s: %s", settings.database_url, status.message)


async def close_db() -> None:
    """Tutup engine saat shutdown (dipakai di lifespan)."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None


def reset_db_for_tests() -> None:
    """Buang singleton engine. Dipakai test agar bisa ganti DATABASE_URL."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None


async def create_schema_for_tests() -> None:
    """Buat semua tabel langsung dengan `create_all`.

    KHUSUS TEST. `init_db()` sengaja tidak lagi membuat tabel — itu tugas
    Alembic sekarang. Test tidak menjalankan `alembic upgrade head` (terlalu
    lambat dan butuh subprocess), jadi ia memakai jalur ini.

    Jangan panggil dari runtime: di sanalah Alembic yang speak, dan dua jalur
    pembuatan skema yang berbeda persis penyebabnya punya `create_all` dihapus
    dari `init_db()` di tempat pertama.
    """
    import backend.models.chat  # noqa: F401
    import backend.models.course  # noqa: F401
    import backend.models.tasks  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
