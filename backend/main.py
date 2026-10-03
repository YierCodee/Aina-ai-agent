"""FastAPI app entry — dibundle jadi sidecar binary via PyInstaller."""
import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.routers.chat import router as chat_router
from backend.routers.courses import materials_router, router as courses_router
from backend.routers.health import router as health_router
from backend.routers.history import router as history_router
from backend.routers.tasks import router as tasks_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Siapkan DB, isi data awal kalau masih kosong, lalu tutup engine saat stop.

    `init_db()` hanya memverifikasi versi skema — pembuatan tabel itu tugas
    Alembic. Kalau versinya tidak cocok, startup TIDAK dihentikan supaya
    `/health` tetap bisa melapor dan pengguna punya jalur diagnosis.
    """
    from backend.core.database import (
        check_schema_revision,
        close_db,
        get_session_factory,
        init_db,
    )

    await init_db()

    status = await check_schema_revision()
    if not status.ok:
        logger.error("Skema DB belum sesuai: %s", status.message)
    elif not settings.seed_demo_data:
        logger.info("Seed demo dimatikan (SEED_DEMO_DATA=false) — database dibiarkan apa adanya.")
    else:
        from backend.seed.courses_seed import seed_courses

        factory = get_session_factory()
        async with factory() as db:
            try:
                if await seed_courses(db):
                    logger.info("Data awal matkul dibuat.")
            except Exception:  # noqa: BLE001
                # Seed gagal tidak boleh mematikan server: halaman chat dan
                # riwayat tetap jalan. Logger supaya masalah terlihat di log sidecar.
                logger.warning("Seed matkul gagal", exc_info=True)

    yield
    await close_db()


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

# Origin Tauri saat aplikasi sudah dibundel.
TAURI_ORIGINS = ["tauri://localhost", "https://tauri.localhost"]

# Vite otomatis pindah ke port berikutnya kalau 5173 sudah dipakai, jadi
# daftar origin statis akan memblokir request dari dev server yang sedang
# berjalan di port lain. Pola ini mengizinkan localhost dan 127.0.0.1 pada
# port mana pun. Hanya relevan di mode pengembangan — aplikasi Tauri yang
# sudah dibundel memakai origin Tauri di atas, bukan http.
DEV_ORIGIN_PATTERN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

app.add_middleware(
    CORSMiddleware,
    allow_origins=TAURI_ORIGINS,
    allow_origin_regex=DEV_ORIGIN_PATTERN.pattern,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(history_router)
app.include_router(courses_router)
app.include_router(materials_router)
app.include_router(tasks_router)


@app.get("/")
def root() -> dict:
    return {"app": settings.app_name, "version": settings.version}


def main() -> None:
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
