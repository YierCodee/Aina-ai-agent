"""Endpoint cek status server."""
import time

from fastapi import APIRouter

from backend.core.config import settings
from backend.core.database import SchemaStatus, check_schema_revision

router = APIRouter()
_started_at = time.monotonic()

# Pemeriksaan versi skema di-cache supaya polling dari Tauri tidak mengulang
# query `alembic_version` tiap detik. Micu invalidasi: proses restart (sidecar
# yang start ulang = proses baru = cache kosong), atau `refresh_schema_cache()`
# dipanggil setelah migrasi.
_SCHEMA_TTL = 5.0
_schema_checked_at: float = 0.0
_schema_status: SchemaStatus | None = None


def refresh_schema_cache() -> None:
    """Paksa pemeriksaan ulang versi skema pada /health berikutnya."""
    global _schema_checked_at, _schema_status
    _schema_checked_at = 0.0
    _schema_status = None


async def _schema_state() -> SchemaStatus:
    global _schema_checked_at, _schema_status
    now = time.monotonic()
    if _schema_status is None or now - _schema_checked_at > _SCHEMA_TTL:
        try:
            _schema_status = await check_schema_revision()
        except Exception as exc:  # noqa: BLE001
            # Engine belum siap (mis. dipanggil sebelum init_db selesai).
            # Jangan gagalkan /health — laporkan saja tidak bisa diperiksa.
            _schema_status = SchemaStatus(
                expected="-", current=None, ok=False,
                message=f"Tidak bisa memeriksa skema: {exc}",
            )
        _schema_checked_at = now
    return _schema_status


@router.get("/health")
async def health() -> dict:
    """Cek status server — dipakai Tauri `sidecar_status` + hook frontend."""
    from backend.agent.agent import get_runner
    from backend.models.gemini import get_model_name, has_gemini_key

    gemini_configured = has_gemini_key()
    # get_runner() di-cache, jadi pemeriksaan ini murah setelah yang pertama.
    agent_ready = get_runner() is not None
    schema = await _schema_state()

    payload = {
        # "degraded" kalau skema DB tidak sesuai — endpoint matkul akan gagal,
        # jadi sidecar sebaiknya diketahui tidak sehat oleh frontend.
        "status": "ok" if schema.ok else "degraded",
        "version": settings.version,
        "uptime_seconds": round(time.monotonic() - _started_at, 1),
        "gemini_configured": gemini_configured,
        "gemini_model": get_model_name(),
        "agent_ready": agent_ready,
        "schema_ok": schema.ok,
        "schema_revision": schema.current,
    }
    if not schema.ok:
        payload["warning"] = schema.message
    elif not gemini_configured:
        payload["warning"] = "GEMINI_API_KEY belum diisi di backend/.env"
    elif not agent_ready:
        from backend.agent.agent import unavailable_reason

        payload["warning"] = unavailable_reason() or "Agent belum siap."
    return payload
