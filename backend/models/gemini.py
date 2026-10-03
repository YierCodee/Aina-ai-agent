"""Gemini client — lazy factory.

Pola: tidak ada koneksi / raise saat import. Client baru dibuat saat
`get_gemini_client()` dipanggil pertama kali. Kalau key kosong, return None
agar server tetap hidup dan /health bisa kasih warning (sesuai pilihan user).

Adjustment untuk Anda:
- Ganti model default: ubah GEMINI_MODEL di backend/.env (tanpa edit kode).
- Mau mode strict (crash kalau key kosong): ganti `return None`
  di get_gemini_client() menjadi `raise RuntimeError(...)`.
- Timeout/retry: ubah GEMINI_TIMEOUT / GEMINI_MAX_RETRIES via settings.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_client = None  # singleton lazy

_PLACEHOLDER_PREFIXES = ("ISI_", "YOUR_", "CHANGE", "PLACEHOLDER", "XXX")


def _is_usable_key(value: str | None) -> bool:
    """Placeholder seperti ISI_API_KEY_ANDA dianggap BELUM diisi."""
    if not value:
        return False
    v = value.strip()
    if not v:
        return False
    return not v.upper().startswith(_PLACEHOLDER_PREFIXES)


def has_gemini_key() -> bool:
    """True jika GEMINI_API_KEY terisi key asli (tanpa expose isinya)."""
    from backend.core.config import settings

    return _is_usable_key(settings.gemini_api_key)


def get_model_name() -> str:
    """Nama model aktif — bisa di-override via GEMINI_MODEL di .env."""
    from backend.core.config import settings

    return settings.gemini_model or "gemini-2.0-flash"


def get_gemini_client():
    """Buat (sekali) dan kembalikan google.genai Client, atau None jika key kosong.

    Return None -> caller wajib handle dengan pesan ramah ke user,
    bukan crash. Contoh:
        client = get_gemini_client()
        if client is None:
            return {"error": "GEMINI_API_KEY belum diisi di backend/.env"}
    """
    global _client
    if _client is not None:
        return _client

    from backend.core.config import settings

    api_key = (settings.gemini_api_key or "").strip()
    if not _is_usable_key(api_key):
        logger.warning("GEMINI_API_KEY kosong/placeholder — isi di backend/.env")
        return None

    try:
        from google import genai
    except ImportError as exc:
        logger.error("Paket google-genai belum terinstall: %s", exc)
        return None

    # Signature benar untuk google-genai >= 1.0: Client(api_key=...)
    _client = genai.Client(api_key=api_key)
    return _client


def reset_gemini_client() -> None:
    """Reset singleton — dipakai saat key diganti saat runtime / testing."""
    global _client
    _client = None


# Backwards-compat: modul lama mengimpor MODEL / TAVILY_API_KEY langsung.
# Jangan pakai untuk kode baru — pakai get_model_name() / settings.
def __getattr__(name: str):
    if name == "MODEL":
        return get_model_name()
    if name == "TAVILY_API_KEY":
        from backend.core.config import settings

        return settings.tavily_api_key
    if name == "GEMINI_API_KEY":
        from backend.core.config import settings

        return settings.gemini_api_key
    if name == "client":
        return get_gemini_client()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
