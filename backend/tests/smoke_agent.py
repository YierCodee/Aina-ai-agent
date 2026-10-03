"""Smoke test agent asisten kuliah.

Menjalankan beberapa turn langsung lewat `run_turn` (melewati HTTP) supaya
gagal mudah dilacak. Jalankan dari root repo:

    python -m backend.tests.smoke_agent

Butuh GEMINI_API_KEY terisi di backend/.env. Test yang memanggil
web_search juga butuh TAVILY_API_KEY.
"""
from __future__ import annotations

import asyncio
import sys

from backend.agent.agent import get_runner, unavailable_reason
from backend.agent.execute import AgentUnavailableError, run_turn

#: (nama, pertanyaan, turnaround yang diharapkan)
# `expect_tool` = None berarti tool tidak boleh dipanggil; "web_search"
# berarti tool itu harus terpakai.
CASES = [
    (
        "konsep dasar",
        "Jelaskan apa itu turunan dan berikan analogi dari kehidupan "
        "sehari-hari.",
        None,
    ),
    (
        "butuh pencarian",
        "Tolong cari lewat internet: apakah Bundesliga 2025/2026 sudah "
        "dimulai, dan kapan tanggal pertamanya?",
        "web_search",
    ),
    (
        "di luar domain",
        "Tuliskan esai siap kirim sepanjang 800 kata tentang dampak "
        "media sosial terhadap remaja.",
        None,
    ),
]


async def _run_one(name: str, question: str, expect_tool: str | None) -> bool:
    print(f"\n{'=' * 70}\n>>> {name}\n{'-' * 70}")
    try:
        result = await run_turn(question, session_id=f"smoke-{name}")
    except Exception as exc:  # noqa: BLE001 - smoke test melaporkan semua
        print(f"GAGAL: {type(exc).__name__}: {exc}")
        return False

    print(f"tools_used = {result['tools_used']}")
    print(f"reply:\n{result['reply']}")

    if expect_tool and expect_tool not in result["tools_used"]:
        print(f"\nGAGAL: tool {expect_tool!r} seharusnya terpakai.")
        return False

    if name == "di luar domain" and "esai" in result["reply"].lower()[:200]:
        # Agent boleh menolak, tapi tidak boleh langsung menulis esai utuh.
        # Pemeriksaan ini longgar — yang dilihat hanya jawaban terawal.
        print("\nPERIKAT: jawaban terawal memuat kata 'esai'.")
        return False

    return True


async def main() -> int:
    if get_runner() is None:
        print("Agent belum siap —", unavailable_reason())
        return 2

    results = [await _run_one(*case) for case in CASES]

    print(f"\n{'=' * 70}")
    print(f"Lolos: {sum(results)}/{len(results)}")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
