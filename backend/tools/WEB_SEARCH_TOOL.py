"""Web search sebagai tool untuk agent (Tavily).

Dipanggil ADK sebagai tool: daftar fungsi dan docstring di bawah dibaca
ADK untuk menyusun function schema yang dikirim ke model. Karena itu
docstring wajib memakai gaya Google (ringkasan + `Args:`) dan nama
parameter harus deskriptif.

Return type adalah `dict`, bukan string JSON. ADK membungkus nilai
kembalian string menjadi `{"result": <string>}` yang boros token,
sedangkan dict diteruskan apa adanya ke model.
"""
from __future__ import annotations

import logging
from typing import Any

import requests

from backend.core.config import settings

logger = logging.getLogger(__name__)

_TAVILY_URL = "https://api.tavily.com/search"

#: Prefix yang menandai key belum diisi (lihat juga models/gemini.py).
_PLACEHOLDER_PREFIXES = ("ISI_", "YOUR_", "CHANGE", "PLACEHOLDER", "XXX")


def _is_configured(value: str | None) -> bool:
    """True kalau value terisi dan bukan placeholder."""
    if not value:
        return False
    v = value.strip()
    if not v:
        return False
    return not v.upper().startswith(_PLACEHOLDER_PREFIXES)


def web_search(query: str) -> dict[str, Any]:
    """Mencari informasi terbaru di internet.

    Gunakan tool ini untuk hal yang berubah-ubah atau yang perlu sumber
    rujukan: jadwal dan tenggat kampus, biaya, prosedur, perkembangan
    terbaru, hasil riset, dan topik yang tidak Anda pastikan sendiri.
    Jangan gunakan untuk hal yang sudah Anda kuasai dengan baik.

    Args:
        query: Kata kunci atau pertanyaan yang ingin dicari di internet.
            Gunakan kalimat singkat dan spesifik, bukan pertanyaan panjang.

    Returns:
        Dict berisi kunci `query`, `answer` (ringkasan dari mesin
        pencarian, bisa None), dan `results` (daftar dict dengan kunci
        `title`, `url`, dan `content`). Kalau pencarian gagal atau key
        belum diisi, hanya mengembalikan kunci `error`.
    """
    logger.info("Agent memanggil web_search: %s", query)

    api_key = (settings.tavily_api_key or "").strip()
    if not _is_configured(api_key):
        return {
            "error": "TAVILY_API_KEY belum diisi di backend/.env, "
            "jadi pencarian internet tidak bisa dijalankan."
        }

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "include_raw_content": False,
        "max_results": settings.tavily_max_results,
    }

    try:
        response = requests.post(_TAVILY_URL, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        logger.warning("web_search gagal: %s", exc)
        return {"error": f"Gagal melakukan pencarian: {exc}"}

    results = [
        {
            "title": item.get("title"),
            "url": item.get("url"),
            "content": item.get("content"),
        }
        for item in data.get("results", [])
    ]

    return {
        "query": query,
        "answer": data.get("answer"),
        "results": results,
    }
