"""Cek cepat: alias serialisasi Pydantic menghasilkan key yang tepat.

Bukan test suite — ini alat bantu saat-bootstrap supaya tidak perlu server
FastAPI hanya untuk melihat nama key JSON.
Jalankan: .venv/bin/python -m backend.tools.check_aliases
"""
from __future__ import annotations

import json

from backend.schemas.courses import (
    CourseCardOut,
    CourseCounts,
    CourseListOut,
    CourseMetrics,
    LecturerCard,
    MaterialAssistant,
    MaterialOut,
    ProgressIn,
    TutorCard,
)

EXPECTED_COURSE_KEYS = {
    "id", "code", "title", "sks", "kelas", "kind", "focus", "weekLabel",
    "progress", "ragFiles", "ragChunks", "lecturer", "tutor", "featured",
}
EXPECTED_MATERIAL_KEYS = {
    "id", "name", "sub", "kind", "sizeLabel", "sizeMB", "modified", "modifiedTs",
    "status", "progress", "assistant", "courseId", "courseTitle", "accessLevel",
}


def main() -> int:
    card = CourseCardOut(
        id="c-matdis",
        code="IF-201",
        title="Matematika Diskrit",
        sks=3,
        kelas="Kelas A (R. 301)",
        kind="teori",
        focus="Logika",
        week_label="Minggu 8: Teori Graf & Pohon",
        progress=65,
        rag_files=32,
        rag_chunks=48,
        lecturer=LecturerCard(
            name="Dr. Ir. Budi Hartono, M.Kom.", initial="B", tone="secondary",
            consult="Sel & Kam 13:00 - 15:00",
        ),
        tutor=TutorCard(name="DiscreteMath AI", desc="Hanya berbasis slide.", emoji="🤖"),
    )
    material = MaterialOut(
        id="f1", name="x.pdf", kind="pdf", size_label="12.4 MB", size_mb=12.4,
        modified_ts=1700000000.0, progress=98,
        assistant=MaterialAssistant(initial="R", name="Raka", tone="surface-dark"),
    )
    listing = CourseListOut(
        total=1,
        items=[card],
        counts=CourseCounts(all=8, teori=6, praktikum=2, progress=4),
        metrics=CourseMetrics(
            total_courses=8, total_sks=20, total_files=224,
            avg_progress=64, dedicated_tutors=8, rag_isolation=100,
        ),
        term_label="Semester Gasal 2025/2026",
    )

    failures: list[str] = []

    course_keys = set(card.model_dump(by_alias=True))
    if course_keys != EXPECTED_COURSE_KEYS:
        failures.append(f"CourseCardOut: kurang={EXPECTED_COURSE_KEYS - course_keys} "
                        f"lebih={course_keys - EXPECTED_COURSE_KEYS}")

    material_keys = set(material.model_dump(by_alias=True))
    if material_keys != EXPECTED_MATERIAL_KEYS:
        failures.append(f"MaterialOut: kurang={EXPECTED_MATERIAL_KEYS - material_keys} "
                        f"lebih={material_keys - EXPECTED_MATERIAL_KEYS}")

    metrics = listing.model_dump(by_alias=True)["metrics"]
    if set(metrics) != {"totalCourses", "totalSks", "totalFiles", "avgProgress",
                        "dedicatedTutors", "ragIsolation"}:
        failures.append(f"CourseMetrics: {sorted(metrics)}")

    # Input harus diterima dalam bentuk camelCase (dipakai frontend).
    parsed = ProgressIn.model_validate(
        {"progressPercent": 70, "currentWeek": 9, "week": {"weekNo": 9, "completed": True}}
    )
    if parsed.progress_percent != 70 or parsed.week is None or parsed.week.week_no != 9:
        failures.append(f"ProgressIn: {parsed}")

    print("CourseCardOut :", json.dumps(card.model_dump(by_alias=True), ensure_ascii=False)[:150], "…")
    print("MaterialOut   :", json.dumps(material.model_dump(by_alias=True), ensure_ascii=False)[:150], "…")
    print("metrics       :", json.dumps(metrics, ensure_ascii=False))
    print("ProgressIn    :", parsed)
    print()

    if failures:
        for f in failures:
            print("GAGAL:", f)
        return 1
    print("OK: semua alias sesuai kontrak frontend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
