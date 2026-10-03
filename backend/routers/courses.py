"""Endpoint matkul & materi.

Pola sama dengan `routers/history.py`: router tipis, semua query di
`services/course_service.py`, skema keluar-masuk di `schemas/courses.py`.

`GET /api/courses` sengaja mengembalikan list + counts + metrics sekaligus.
Halaman Courses sebelumnya menghitung semuanya di `useMemo` dari satu array
frontend; sekarang butuh tiga hal dari server, dan tiga request terpisah akan
berlomba update state sehingga layar berkedip.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.schemas.courses import (
    CountOut,
    CourseCreateIn,
    CourseDetailOut,
    CourseListOut,
    CourseCardOut,
    CourseUpdateIn,
    FolderCreateIn,
    FolderDeleteOut,
    FolderListOut,
    FolderOut,
    FolderUpdateIn,
    MaterialBulkIn,
    MaterialListOut,
    MaterialOut,
    MaterialProgressIn,
    ProgressIn,
    TermCreateIn,
    TermListOut,
    TermOut,
    TutorSessionIn,
    TutorSessionOut,
)
from backend.services import course_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["courses"])
materials_router = APIRouter(prefix="/api", tags=["materials"])


def _not_found(exc: svc.NotFound) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


def _domain_conflict(exc: svc.Conflict) -> HTTPException:
    """Konflik domain → 409.

    Berbeda dari `_conflict()`: yang ini untuk bentrok yang bisa dijelaskan tanpa
    melihat pesan driver, misalnya "sudah dilepas dari semester".
    """
    return HTTPException(status_code=409, detail=str(exc))


# Cara pesan IntegrityError di SQLite bekerja, dan akibatnya untuk pemetaan ini:
#
#   UNIQUE  -> menyebut KOLOM, bukan nama constraint
#             "UNIQUE constraint failed: courses.code"
#   CHECK   -> menyebut NAMA constraint
#             "CHECK constraint failed: ck_mat_progress"
#
# Karena itu semua kunci di bawah harus cocok dengan apa yang benar-benar muncul
# di pesan driver. Dulu ada dua daftar terpisah (satu for constraint, satu for
# kolom) dan yang berbasis nama constraint tidak pernah kepakai — tidak ada
# driver SQLite yang menghasilkannya. Sekarang satu tabel, diurut dari paling
# spesifik.
#
# `internal=True` berarti tidak bisa dipicu oleh input pengguna: kalau muncul,
# itu bug di kode kita, dan pesan untuk pengguna tidak akan berguna.
_CONFLICTS: tuple[tuple[str, int, str, bool], ...] = (
    (
        "course_tutors.rag_namespace",
        409,
        "Sandbox tutor bentrok — ini bug, bukan kesalahan input.",
        True,
    ),
    ("courses.code", 409, "Kode matkul sudah dipakai.", False),
    (
        "course_offerings.course_id",
        409,
        "Kelas ini sudah ada di semester berjalan.",
        False,
    ),
    (
        "enrollments.user_id",
        409,
        "Mata kuliah ini sudah terdaftar.",
        False,
    ),
    (
        "course_weeks.week_no",
        409,
        "Nomor minggu sudah ada di silabus ini.",
        False,
    ),
    ("ai_tutors.name", 409, "Nama tutor sudah dipakai.", False),
    ("terms.id", 409, "Semester untuk tahun ajaran itu sudah ada.", False),
    ("lecturers.name", 409, "Nama dosen sudah dipakai.", False),
    ("lecturers.nidn", 409, "NIDN sudah dipakai dosen lain.", False),
    (
        "CHECK constraint failed",
        422,
        "Nilai ada yang di luar rentang yang diizinkan.",
        False,
    ),
    (
        "FOREIGN KEY constraint failed",
        422,
        "Relasi tidak ditemukan — muat ulang halaman.",
        False,
    ),
)


def _conflict(exc: IntegrityError) -> HTTPException:
    """Petakan `IntegrityError` ke 409/422 dengan pesan yang bisa diperbaiki pengguna.

    Tanpa ini, pelanggaran unique constraint jadi 500 dan frontend hanya
    menampilkan "Terjadi kesalahan." — padahal penyebabnya (kode dobel) itu
    hal yang orang bisa langsung perbaiki.
    """
    raw = str(getattr(exc, "orig", exc))
    for needle, status, message, internal in _CONFLICTS:
        if needle in raw:
            if internal:
                logger.error("Konflik internal (%s): %s", needle, raw)
            return HTTPException(status_code=status, detail=message)
    logger.warning("IntegrityError tak terpetakan: %s", raw)
    return HTTPException(
        status_code=409, detail="Data bentrok dengan data yang sudah ada."
    )


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------
@router.get("/courses", response_model=CourseListOut)
async def list_courses(
    q: str = Query(default="", max_length=128),
    tab: str = Query(default="all", pattern="^(all|teori|praktikum)$"),
    quick_view: str = Query(
        default="all", pattern="^(all|teori|praktikum|progress)$"
    ),
    sort: str = Query(default="progress", pattern="^(name|progress|sks)$"),
    user_id: str = Query(default="mahasiswa", max_length=128),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> CourseListOut:
    """Satu round-trip: kartu matkul, hitungan quick view, dan angka metric."""
    return await svc.list_courses(
        db,
        user_id=user_id,
        q=q,
        tab=tab,
        quick_view=quick_view,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
async def get_course(
    course_id: str,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CourseDetailOut:
    """Detail: kartu + daftar minggu + slot konsultasi + tutor & namespace."""
    try:
        return await svc.get_course_detail(db, course_id, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/courses", response_model=CourseCardOut, status_code=201)
async def create_course(
    payload: CourseCreateIn,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CourseCardOut:
    """Daftarkan matkul ke semester aktif.

    Satu permintaan membuat katalog + offering + enrollment, jadi form yang
    mengirim identitas, kelas, dosen, dan tutor sekaligus tetap atomik.
    """
    try:
        return await svc.create_course(db, payload, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@router.patch("/courses/{course_id}", response_model=CourseCardOut)
async def update_course(
    course_id: str,
    payload: CourseUpdateIn,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CourseCardOut:
    """Patch sebagian. Field yang tidak dikirim tidak disentuh.

    `tutor: null` berarti lepaskan tutor (sandbox RAG ikut hilang dan
    `rag_isolation` turun); `weeks` yang dikirim hanya di-upsert, minggu lain
    tidak dihapus.
    """
    try:
        return await svc.update_course(db, course_id, payload, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@router.delete("/courses/{course_id}", response_model=CountOut)
async def drop_course(
    course_id: str,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CountOut:
    """Lepas matkul dari semester (soft delete).

    `status` jadi `'dropped'` — kartu hilang dari daftar, hitungan, dan metric,
    tapi materinya tetap utuh. Pulihkan dengan `POST /courses/{id}/restore`.
    """
    try:
        await svc.drop_enrollment(db, course_id, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    return CountOut(deleted=1)


@router.post("/courses/{course_id}/restore", response_model=CourseCardOut)
async def restore_course(
    course_id: str,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CourseCardOut:
    """Kembalikan matkul yang di-soft-delete, kalau semesternya masih aktif."""
    try:
        return await svc.restore_enrollment(db, course_id, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc


@router.patch("/courses/{course_id}/progress", response_model=CourseCardOut)
async def update_progress(
    course_id: str,
    payload: ProgressIn,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CourseCardOut:
    """Update progres, minggu berjalan, atau status featured."""
    try:
        return await svc.update_progress(db, course_id, payload, user_id=user_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@router.post("/courses/{course_id}/tutor-session", response_model=TutorSessionOut)
async def create_tutor_session(
    course_id: str,
    payload: TutorSessionIn,
    user_id: str = Query(default="mahasiswa", max_length=128),
    db: AsyncSession = Depends(get_db),
) -> TutorSessionOut:
    """Buat sesi chat yang di-scope ke matkul ini saja.

    Sesi yang sama dikembalikan kalau sudah ada, jadi klik "Tanya tutor" dua
    kali tidak membuat dua percakapan terpisah.
    """
    try:
        return await svc.create_tutor_session(
            db,
            course_id,
            user_id=user_id,
            session_id=payload.session_id,
            message=payload.message,
        )
    except svc.NotFound as exc:
        raise _not_found(exc) from exc


# ---------------------------------------------------------------------------
# Terms (semester)
# ---------------------------------------------------------------------------
@router.get("/terms", response_model=TermListOut)
async def list_terms(db: AsyncSession = Depends(get_db)) -> TermListOut:
    """Semua semester + id yang aktif. Dipakai dialog pengelola semester."""
    return await svc.list_terms(db)


@router.post("/terms", response_model=TermOut, status_code=201)
async def create_term(
    payload: TermCreateIn,
    db: AsyncSession = Depends(get_db),
) -> TermOut:
    """Buat semester baru.

    `activate` default True supaya alur "belum ada semester aktif" (error 409
    saat enroll matkul) selesai dalam satu langkah dari dialog.
    """
    try:
        return await svc.create_term(db, payload)
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@router.post("/terms/{term_id}/activate", response_model=TermOut)
async def activate_term(
    term_id: str,
    db: AsyncSession = Depends(get_db),
) -> TermOut:
    """Aktifkan semester. Idempotent; menonaktifkan semester lain."""
    try:
        return await svc.activate_term(db, term_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc


# ---------------------------------------------------------------------------
# Materials (dipakai FilesPage)
# ---------------------------------------------------------------------------
@materials_router.get("/materials", response_model=MaterialListOut)
async def list_materials(
    tab: str = Query(default="all", pattern="^(all|recent|shared|trash)$"),
    kind: str = Query(default="all", max_length=16),
    q: str = Query(default="", max_length=128),
    course_id: str | None = Query(default=None, max_length=64),
    folder_id: str | None = Query(default=None, max_length=64),
    sort: str = Query(default="recent", pattern="^(recent|name|size)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> MaterialListOut:
    return await svc.list_materials(
        db,
        tab=tab,
        kind=kind,
        q=q,
        course_id=course_id,
        folder_id=folder_id,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@materials_router.post("/materials/upload", response_model=list[MaterialOut])
async def upload_materials(
    background: BackgroundTasks,
    files: list[UploadFile] = File(default=[]),
    offering_id: str | None = Query(default=None, max_length=64),
    course_id: str | None = Query(default=None, max_length=64),
    folder_id: str | None = Query(default=None, max_length=64),
    db: AsyncSession = Depends(get_db),
) -> list[MaterialOut]:
    """Upload byte file + antre ingest RAG riil.

    Menyimpan ke `settings.storage_dir`, mencatat `storage_path`, lalu
    menjadwalkan `ingest_service.run_ingest` per file. Tanpa batas ukuran
    kaku: `size_mb` dicatat apa adanya. Status awal `queued`; polling
    `GET /api/materials` sampai `indexed`/`error`.
    """
    from backend.services.ingest_service import run_ingest

    if not files:
        return []
    payload: list[tuple[str, bytes]] = []
    for upload in files[:20]:
        payload.append((upload.filename or "upload.bin", await upload.read()))
    try:
        created = await svc.create_materials_upload(
            db, payload, offering_id=offering_id, course_id=course_id,
            folder_id=folder_id,
        )
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc
    for item in created:
        background.add_task(run_ingest, item.id)
    return created


@materials_router.get("/materials/search")
async def search_materials(
    q: str = Query(default="", max_length=500),
    course_id: str | None = Query(default=None, max_length=64),
    top_k: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Debug retrieval: chunks paling relevan untuk satu matkul."""
    from sqlalchemy import select

    from backend.models.course import CourseOffering, Term
    from backend.services import search_service

    if not q.strip():
        return {"items": []}
    offering_id = (
        await db.execute(
            select(CourseOffering.id)
            .join(Term, CourseOffering.term_id == Term.id)
            .where(
                CourseOffering.course_id == course_id,
                Term.is_active.is_(True),
            )
            .order_by(CourseOffering.id)
            .limit(1)
        )
    ).scalar_one_or_none() if course_id else None
    if course_id and offering_id is None:
        raise HTTPException(status_code=404, detail="Mata kuliah tidak ditemukan.")
    items = await search_service.search_chunks(
        db, offering_id=offering_id or "", query=q, top_k=top_k
    )
    return {"items": items}


@materials_router.post("/materials", response_model=list[MaterialOut])
async def create_materials(
    payload: MaterialBulkIn,
    db: AsyncSession = Depends(get_db),
) -> list[MaterialOut]:
    """Catat hasil dropzone. Metadata saja — byte file belum diproses."""
    if not payload.files:
        return []
    try:
        return await svc.create_materials(
            db, [f.model_dump() for f in payload.files]
        )
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@materials_router.patch("/materials/{material_id}", response_model=MaterialOut)
async def update_material(
    material_id: str,
    payload: MaterialProgressIn,
    db: AsyncSession = Depends(get_db),
) -> MaterialOut:
    """Perbarui status indexing. Dipakai loop simulasi indexing di FilesPage.

    Field yang tidak dikirim tidak diubah — `exclude_unset=True` supaya patch
    parsial tidak menimpa kolom lain dengan default model.
    """
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    # Alias frontend (`sub`) diterjemahkan ke nama kolom di sini.
    if "derived_note" in changes and payload.derived_note is None:
        del changes["derived_note"]
    if "progress" in changes and changes["progress"] is not None:
        changes["index_progress"] = changes.pop("progress")
    try:
        return await svc.update_material(db, material_id, changes)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@materials_router.delete("/materials/{material_id}", response_model=CountOut)
async def delete_material(
    material_id: str, db: AsyncSession = Depends(get_db)
) -> CountOut:
    deleted = await svc.delete_material(db, material_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Berkas tidak ditemukan.")
    return CountOut(deleted=1)


@materials_router.get("/folders", response_model=FolderListOut)
async def list_folders(db: AsyncSession = Depends(get_db)) -> FolderListOut:
    """Folder untuk PinnedFolders. Jumlah & ukuran dihitung dari materi."""
    return await svc.list_folders(db)


@materials_router.post("/folders", response_model=FolderOut, status_code=201)
async def create_folder(
    payload: FolderCreateIn, db: AsyncSession = Depends(get_db)
) -> FolderOut:
    """Buat folder virtual baru (global atau scope satu offering).

    Nama duplikat dalam scope yang sama → 409; `offering_id` yang tidak ada
    → 404. Folder baru langsung tampil di `GET /api/folders` dengan
    `0 files`, karena angkanya agregat, bukan kolom tersimpan.
    """
    try:
        return await svc.create_folder(
            db,
            name=payload.name,
            icon=payload.icon,
            badge_tone=payload.badge_tone,
            badge_label=payload.badge_label,
            offering_id=payload.offering_id,
            course_id=payload.course_id,
        )
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@materials_router.patch("/folders/{folder_id}", response_model=FolderOut)
async def update_folder(
    folder_id: str,
    payload: FolderUpdateIn,
    db: AsyncSession = Depends(get_db),
) -> FolderOut:
    """Rename / ganti ikon folder. Nama duplikat per scope → 409."""
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    try:
        return await svc.update_folder(
            db,
            folder_id,
            name=changes.get("name"),
            icon=changes.get("icon"),
        )
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    except svc.Conflict as exc:
        raise _domain_conflict(exc) from exc
    except IntegrityError as exc:
        raise _conflict(exc) from exc


@materials_router.delete("/folders/{folder_id}", response_model=FolderDeleteOut)
async def delete_folder(
    folder_id: str, db: AsyncSession = Depends(get_db)
) -> FolderDeleteOut:
    """Hapus folder permanen; isi jadi file lepas (`released` menyebut jumlahnya)."""
    try:
        deleted, released = await svc.delete_folder(db, folder_id)
    except svc.NotFound as exc:
        raise _not_found(exc) from exc
    return FolderDeleteOut(deleted=deleted, released=released)
