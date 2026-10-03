"""Cek bahwa klaim di `agent.md` / `integrasi.md` masih cocok dengan kodenya.

Dokumentasi yang melenceng lebih buruk daripada tidak ada dokumentasi: orang
berhenti mempercayainya begitu ketahuan satu kali salah. Jadi setiap aturan yang
menyebut nama class, nama fungsi, atau batas angka diverifikasi ke file aslinya.

Jalankan: .venv/bin/python -m backend.tools.check_docs_claims
"""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def code_without_comments(rel: str) -> str:
    """Buang baris komentar supaya frasa di dokumentasi tidak ikut terhitung."""
    return "\n".join(
        line for line in read(rel).splitlines() if not line.strip().startswith("//")
    )


def in_code(rel: str, needle: str) -> bool:
    return needle in code_without_comments(rel)

def _upsert_applies_fields_both_paths(
    rel: str, start: str, end: str, needle: str
) -> bool:
    """Assignment field harus di LUAR blok if/else, jadi kena dua jalur.

    Bentuk yang benar: `return` lebih dulu di dalam cabang "dibuat baru", lalu
    assignment, lalu `return` terakhir yang dipakai kedua jalur. Kalau
    assignment-nya ikut masuk ke dalam salah satu cabang saja, jalur yang lain
    mengembalikan baris lama tanpa perubahan — persis bug yang pernah terjadi.
    """
    body = read(rel)
    section = body[body.index(start): body.index(end)]
    if section.count(needle) != 1:
        return False
    at = section.index(needle)
    returns = [
        i for i in range(len(section)) if section.startswith("return found.id", i)
    ]
    if len(returns) < 2:
        return False
    # Berada di antara return cabang else dan return bersama.
    return returns[0] < at < returns[-1]


CHECKS: list[tuple[str, bool]] = [
    # --- agent.md bagian 7: tombol danger ---
    ("agent.md §7: `danger` pakai pasangan token error/on-error",
     in_code("src/components/ui/button.tsx", "bg-error text-on-error")),
    ("agent.md §7: hover `danger` bukan brightness",
     "danger" in read("src/components/ui/button.tsx")
     and not re.search(r"danger:[^\n]*brightness", read("src/components/ui/button.tsx"))),
    ("agent.md §7: badge `danger` masih dipakai terpisah",
     in_code("src/components/ui/badge.tsx", "bg-error-container text-error")),

    # --- agent.md bagian 8: dialog form ---
    ("agent.md §8: CourseFormDialog max-w-2xl + max-h + scroll",
     all(t in read("src/components/courses/CourseFormDialog.tsx")
         for t in ("max-w-2xl", "max-h-[85dvh]", "overflow-y-auto"))),
    ("agent.md §8: label seksi uppercase tracking-wider",
     "uppercase tracking-wider text-text-secondary"
     in read("src/components/courses/CourseFormDialog.tsx")),
    ("agent.md §11: CourseFormDialog tidak memakai useEffect",
     "useEffect" not in code_without_comments("src/components/courses/CourseFormDialog.tsx")),
    ("agent.md §11: reset dilakukan saat render (prevKey)",
     "prevDraftKey !== draftKey" in read("src/components/courses/CourseFormDialog.tsx")),

    # --- agent.md bagian 9: dialog konfirmasi ---
    ("agent.md §9: judul dialog 'Lepas dari semester?'",
     "Lepas dari semester?" in read("src/components/courses/CourseDeleteDialog.tsx")),
    ("agent.md §9: ikon TriangleAlert colored error",
     "TriangleAlert" in read("src/components/courses/CourseDeleteDialog.tsx")
     and "text-error" in read("src/components/courses/CourseDeleteDialog.tsx")),
    ("agent.md §9: tombol konfirmasi variant danger",
     in_code("src/components/courses/CourseDeleteDialog.tsx", 'variant="danger"')),
    ("agent.md §8: kedua tombol dialog konfirmasi nonaktif saat busy",
     read("src/components/courses/CourseDeleteDialog.tsx").count("disabled={busy") >= 2),

    # --- agent.md bagian 10: menu per kartu ---
    ("agent.md §10: trigger menu variant tool + aria",
     in_code("src/components/courses/CourseCard.tsx", 'variant="tool"')
     and 'aria-haspopup="menu"' in read("src/components/courses/CourseCard.tsx")),
    ("agent.md §10: menu/item punya role menu & menuitem",
     'role="menu"' in read("src/components/courses/CourseCard.tsx")
     and 'role="menuitem"' in read("src/components/courses/CourseCard.tsx")),
    ("agent.md §10: menu ditutup pada Escape",
     "Escape" in read("src/components/courses/CourseCard.tsx")),
    ("agent.md §10: item destructive styled error, bukan variant danger",
     "text-error hover:bg-error-container" in read("src/components/courses/CourseCard.tsx")),

    # --- agent.md: aturan data ---
    ("agent.md: draftFromCard tidak memecah class_label",
     "classLabel: course.kelas" in read("src/data/courses.ts")
     and not re.search(r"classLabel:\s*match", read("src/data/courses.ts"))),
    ("agent.md: validate() menegakkan SKS 0-12 dan progres 0-100",
     "draft.sks > 12" in read("src/components/courses/CourseFormDialog.tsx")
     and "draft.progressPercent > 100" in read("src/components/courses/CourseFormDialog.tsx")),
    ("agent.md: sanitizeWeeks() menegakkan minggu 1-20 + judul + duplikat",
     all(t in read("src/data/courses.ts") for t in ("n > 20", "w.title.trim()", "seen.has(n)"))),
    ("agent.md: TONE_CLASSES masih 6 class literal",
     read("src/data/courses.ts").count("'bg-") == 6
     or read("src/utils/tone.ts").count("'bg-") == 6),
    ("agent.md: dialog.tsx centered tanpa offset sbw",
     "left-1/2" in read("src/components/ui/dialog.tsx")
     and "var(--sbw" not in read("src/components/ui/dialog.tsx")),

    # --- integrasi.md: endpoint & perilaku ---
    ("integrasi.md: empat endpoint CRUD terdaftar di router",
     all(f'"/courses"' in read("backend/routers/courses.py") for _ in [0])
     and read("backend/routers/courses.py").count('@router.') >= 5
     and '"/courses/{course_id}/restore"' in read("backend/routers/courses.py")),
    ("integrasi.md: create_course reuse offering yang ada",
     "_has_active_enrollment" in read("backend/services/course_service.py")
     and "_relink_offering" in read("backend/services/course_service.py")),
    ("integrasi.md: patch memakai exclude_unset",
     "exclude_unset=True" in read("backend/services/course_service.py")),
    ("integrasi.md: soft delete hanya mengubah status enrollment",
     'enrollment.status = "dropped"' in read("backend/services/course_service.py")),
    ("integrasi.md: weeks tidak pernah dihapus saat patch",
     "changes.get(\"weeks\")" in read("backend/services/course_service.py")
     and "delete(CourseWeek)" not in read("backend/services/course_service.py")),
    ("integrasi.md: _conflict memetakan kolom (bukan nama constraint)",
     "courses.code" in read("backend/routers/courses.py")
     and "uq_courses_code" not in read("backend/routers/courses.py")),
    # Bagian 4 di integrasi.md: field dari form harus diterapkan SETELAH
    # cabang id/by-name,
    # bukan hanya di jalur `id`. Dicek dari posisinya: assignment harus berada
    # setelah blok `if lecturer_id: ... else: ...`, bukan di dalam salah satunya.
    ("integrasi.md §4: upsert menerapkan field di kedua jalur",
     _upsert_applies_fields_both_paths(
         "backend/services/course_service.py",
         "async def _upsert_lecturer",
         "async def _upsert_tutor",
         'found.avatar_tone = spec.get("avatar_tone") or',
     )),
    ("integrasi.md §4: upsert boleh memperbarui email",
     'found.email = spec["email"]' in read("backend/services/course_service.py")),
    ("integrasi.md: id material memakai uuid4",
     "uuid4().hex[:12]" in read("backend/services/course_service.py")),
    ("integrasi.md: create_materials mengambil baris per ID",
     "CourseMaterial.id.in_(wanted)" in read("backend/services/course_service.py")),

    # --- skema tidak boleh bergeser diam-diam ---
    ("integrasi.md: schema revision masih 0003_tasks_copilot",
     'SCHEMA_REVISION = "0003_tasks_copilot"' in read("backend/core/database.py")),
    ("integrasi.md: SEED_DEMO_DATA=false mematikan auto-seed",
     "seed_demo_data" in read("backend/core/config.py")
     and "settings.seed_demo_data" in read("backend/main.py")),
]



def main() -> int:
    failed = [label for label, passed in CHECKS if not passed]
    for label, passed in CHECKS:
        print(f"  {'OK  ' if passed else 'GAGAL'} {label}")
    print()
    print(f"{len(CHECKS) - len(failed)}/{len(CHECKS)} klaim cocok.")
    if failed:
        print("\nKlaim yang tidak cocok — dokumentasi perlu diperbarui:")
        for label in failed:
            print(f"  - {label}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
