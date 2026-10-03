/**
 * Klien endpoint matkul & materi untuk FastAPI sidecar.
 *
 * Mengikuti `lib/chatApi.ts`: `fetch` langsung ke `SIDECAR_BASE_URL`, bukan
 * `invoke` Tauri, karena `tauri.conf.json` memakai `"csp": null`.
 *
 * Bentuk tipe di sini adalah cermin dari `backend/schemas/courses.py`. Both
 * ends perlu diubah bersama kalau ada field baru.
 */
import { SIDECAR_BASE_URL } from '@/lib/sidecar'
import type {
  CourseCounts,
  CourseItem,
  CourseKind,
  CourseListPayload,
  CourseMetrics,
  CoursesSort,
  CoursesTab,
  CourseQuickViewId,
} from '@/data/courses'
import type { FileDoc, FileFolder } from '@/data/files'

/** Error yang sudah diterjemahkan ke pesan berbahasa manusia. */
export class CoursesApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'CoursesApiError'
    this.status = status
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  // 409 dipakai backend untuk bentrok domain ("kode sudah dipakai") dan untuk
  // unique constraint. Hampir selalu datang dengan `detail` yang spesifik; ini
  // hanya jaring pengaman kalau `detail` tidak ada.
  409: 'Data bentrok dengan data yang sudah ada.',
  404: 'Data tidak ditemukan.',
  422: 'Permintaan tidak valid.',
  500: 'Backend gagal memproses permintaan.',
  503: 'Backend belum siap. Periksa log sidecar.',
}

const OFFLINE_MESSAGE = 'Tidak bisa menghubungi sidecar. Pastikan backend berjalan.'

/** Utas "belum dimigrasi" — pesan paling mungkin terjadi setelah upgrade. */
const SCHEMA_MESSAGE =
  'Skema database belum sesuai. Jalankan `alembic upgrade head` di repo backend.'

/**
 * Ambil teks pesan dari balisan error FastAPI.
 *
 * `detail` berupa string kalau kita lempar manual; bentuk validation error
 * punya `detail` berupa array objek yang tidak boleh ditampilkan mentah.
 */
function readErrorDetail(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const detail = (payload as { detail?: unknown }).detail
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof CoursesApiError && error.message === 'Permintaan dibatalkan.'
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function throwForStatus(response: Response, payload: unknown): never {
  const detail = readErrorDetail(payload)
  const message =
    detail ?? STATUS_MESSAGES[response.status] ?? 'Terjadi kesalahan.'
  // Pesan migrasi diteruskan apa adanya supaya pengguna tahu harus jalankan
  // perintah apa, bukan hanya melihat "Internal Server Error".
  throw new CoursesApiError(
    /alembic upgrade head/i.test(message) ? SCHEMA_MESSAGE : message,
    response.status,
  )
}

type RequestOptions = {
  signal?: AbortSignal
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${SIDECAR_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: options.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (cause) {
    if (isAbort(cause)) throw new CoursesApiError('Permintaan dibatalkan.', null)
    void cause
    throw new CoursesApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  return payload
}

export type CourseQuery = {
  q?: string
  tab?: CoursesTab
  quickView?: CourseQuickViewId
  sort?: CoursesSort
  limit?: number
  offset?: number
}

function courseParams(query: CourseQuery): string {
  const params = new URLSearchParams()
  if (query.q?.trim()) params.set('q', query.q.trim())
  if (query.tab && query.tab !== 'all') params.set('tab', query.tab)
  if (query.quickView && query.quickView !== 'all')
    params.set('quick_view', query.quickView)
  if (query.sort) params.set('sort', query.sort)
  params.set('limit', String(query.limit ?? 100))
  params.set('offset', String(query.offset ?? 0))
  return params.toString()
}

/**
 * Satu request untuk seluruh halaman Courses: kartu, hitungan quick view, dan
 * angka metric. Backend sengaja tidak mengembalikan tiga request terpisah —
 * tiga fetch yang berlomba akan membuat layar berkedip.
 */
export async function fetchCourses(
  query: CourseQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<CourseListPayload> {
  const payload = await request(`/api/courses?${courseParams(query)}`, {
    signal: options.signal,
  })
  const data = payload as Partial<CourseListPayload> | null
  return {
    total: typeof data?.total === 'number' ? data.total : 0,
    items: Array.isArray(data?.items) ? data.items : [],
    counts: (data?.counts ?? {
      all: 0,
      teori: 0,
      praktikum: 0,
      progress: 0,
    }) as CourseCounts,
    metrics: (data?.metrics ?? {
      totalCourses: 0,
      totalSks: 0,
      totalFiles: 0,
      avgProgress: 0,
      dedicatedTutors: 0,
      ragIsolation: 0,
    }) as CourseMetrics,
    termLabel: data?.termLabel ?? '',
  }
}

export type ProgressPatch = {
  progressPercent?: number
  currentWeek?: number
  featured?: boolean
  week?: { weekNo?: number; completed?: boolean }
}

/** Update progres satu matkul. Balasannya kartu yang sudah ter-refresh. */
export async function updateCourseProgress(
  courseId: string,
  patch: ProgressPatch,
  options: { signal?: AbortSignal } = {},
): Promise<CourseItem | null> {
  const payload = await request(
    `/api/courses/${encodeURIComponent(courseId)}/progress`,
    { method: 'PATCH', body: patch, signal: options.signal },
  )
  return (payload as CourseItem | null) ?? null
}

export type TutorSession = {
  sessionId: string
  tutorId: string
  tutorName: string
  ragNamespace: string
  openingPrompt: string
}

export type TermItem = {
  id: string
  label: string
  academicYear: string
  semesterNo: 1 | 2
  startsOn: string | null
  endsOn: string | null
  isActive: boolean
}

export type TermCreateBody = {
  label: string
  academicYear: string
  semesterNo: 1 | 2
  startsOn?: string | null
  endsOn?: string | null
  activate?: boolean
}

/** Semua semester + id yang sedang aktif (null kalau belum ada). */
export async function listTerms(
  options: { signal?: AbortSignal } = {},
): Promise<{ items: TermItem[]; activeId: string | null }> {
  const payload = await request('/api/terms', { signal: options.signal })
  const data = payload as {
    items?: TermItem[]
    activeId?: string | null
  } | null
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    activeId: data?.activeId ?? null,
  }
}

/** Buat semester baru. `activate` default true di backend. */
export async function createTerm(
  body: TermCreateBody,
  options: { signal?: AbortSignal } = {},
): Promise<TermItem> {
  const payload = await request('/api/terms', {
    method: 'POST',
    body,
    signal: options.signal,
  })
  return payload as TermItem
}

/** Aktifkan semester. Idempotent; menonaktifkan semester lain. */
export async function activateTerm(
  termId: string,
  options: { signal?: AbortSignal } = {},
): Promise<TermItem> {
  const payload = await request(
    `/api/terms/${encodeURIComponent(termId)}/activate`,
    { method: 'POST', signal: options.signal },
  )
  return payload as TermItem
}

/**
 * Badan request create/update. Field opsional boleh TIDAK dikirim, dan itu
 * berbeda dari dikirim `null`:
 *
 * - `focus` tidak dikirim  -> kolom tidak disentuh (mode edit sebagian)
 * - `focus: null` dikirim  -> kolom dikosongkan
 * - `tutor: null` dikirim  -> tutor dilepas, `ragIsolation` turun
 *
 * `undefined` di objek berarti "hapus dari JSON" — `JSON.stringify` sudah
 * melakukan itu sendiri, jadi tidak perlu filter manual.
 */
export type CourseWriteBody = {
  code?: string
  title?: string
  kind?: CourseKind
  sks?: number
  focus?: string | null
  classLabel?: string
  room?: string | null
  lecturer?: {
    id?: string | null
    name: string
    /** `null` berarti kosongkan — backend membacanya sebagai `str | None`. */
    email?: string | null
    avatarTone?: string
  }
  tutor?: { id?: string | null; name: string; description?: string; emoji?: string } | null
  progressPercent?: number
  currentWeek?: number
  featured?: boolean
  weeks?: {
    weekNo: number
    title: string
    meetingKind?: string
    completed?: boolean
  }[]
}

/**
 * Daftarkan matkul baru ke semester aktif.
 *
 * Satu permintaan membuat katalog + offering + enrollment, jadi form yang
 * mengirim identitas, kelas, dosen, dan tutor sekaligus tetap atomik.
 */
export async function createCourse(
  body: CourseWriteBody,
  options: { signal?: AbortSignal } = {},
): Promise<CourseItem> {
  const payload = await request('/api/courses', {
    method: 'POST',
    body,
    signal: options.signal,
  })
  return payload as CourseItem
}

/** Patch sebagian satu matkul. Kartu yang dikembalikan sudah ter-refresh. */
export async function updateCourse(
  courseId: string,
  body: CourseWriteBody,
  options: { signal?: AbortSignal } = {},
): Promise<CourseItem> {
  const payload = await request(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'PATCH',
    body,
    signal: options.signal,
  })
  return payload as CourseItem
}

/**
 * Lepas matkul dari semester (soft delete).
 *
 * Barisnya tetap ada bersama materi dan minggu, jadi `restoreCourse` bisa
 * mengembalikannya. Melaporkan `deleted: 0` sebagai throw supaya UI tidak
 * diam-diam gagal — `CountOut` selalu mengembalikan angka.
 */
export async function dropCourse(
  courseId: string,
  options: { signal?: AbortSignal } = {},
): Promise<number> {
  const payload = await request(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
    signal: options.signal,
  })
  const deleted = (payload as { deleted?: number } | null)?.deleted
  if (typeof deleted !== 'number' || deleted < 1) {
    throw new CoursesApiError('Mata kuliah tidak dihapus.', 500)
  }
  return deleted
}

/** Kembalikan matkul yang di-soft-delete, asal semester offering masih aktif. */
export async function restoreCourse(
  courseId: string,
  options: { signal?: AbortSignal } = {},
): Promise<CourseItem> {
  const payload = await request(
    `/api/courses/${encodeURIComponent(courseId)}/restore`,
    { method: 'POST', body: {}, signal: options.signal },
  )
  return payload as CourseItem
}
/**
 * Minta sesi chat yang di-scope ke satu matkul.
 *
 * Idempoten di sisi server: panggilan kedua untuk matkul yang sama mengembalikan
 * `sessionId` yang sama, bukan percakapan baru.
 */
export async function createTutorSession(
  courseId: string,
  body: { sessionId?: string; message?: string } = {},
  options: { signal?: AbortSignal } = {},
): Promise<TutorSession> {
  const payload = await request(
    `/api/courses/${encodeURIComponent(courseId)}/tutor-session`,
    { method: 'POST', body, signal: options.signal },
  )
  const data = payload as Partial<TutorSession> | null
  return {
    sessionId: data?.sessionId ?? `course-${courseId}`,
    tutorId: data?.tutorId ?? '',
    tutorName: data?.tutorName ?? '',
    ragNamespace: data?.ragNamespace ?? '',
    openingPrompt: data?.openingPrompt ?? '',
  }
}

// ---------------------------------------------------------------------------
// Materials — dipakai FilesPage
// ---------------------------------------------------------------------------
export type MaterialQuery = {
  tab?: 'all' | 'recent' | 'shared' | 'trash'
  kind?: string
  q?: string
  courseId?: string | null
  /** Saring ke satu folder. null/undefined = semua lokasi. */
  folderId?: string | null
  sort?: 'recent' | 'name' | 'size'
  limit?: number
  offset?: number
}

export type MaterialStats = {
  total: number
  indexed: number
  indexing: number
  totalChunks: number
  totalSizeMB: number
}

export type MaterialListPayload = {
  total: number
  items: FileDoc[]
  stats: MaterialStats
}

function materialParams(query: MaterialQuery): string {
  const params = new URLSearchParams()
  if (query.tab && query.tab !== 'all') params.set('tab', query.tab)
  if (query.kind && query.kind !== 'all') params.set('kind', query.kind)
  if (query.q?.trim()) params.set('q', query.q.trim())
  if (query.courseId) params.set('course_id', query.courseId)
  if (query.folderId) params.set('folder_id', query.folderId)
  if (query.sort) params.set('sort', query.sort)
  params.set('limit', String(query.limit ?? 50))
  params.set('offset', String(query.offset ?? 0))
  return params.toString()
}

export async function fetchMaterials(
  query: MaterialQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<MaterialListPayload> {
  const payload = await request(`/api/materials?${materialParams(query)}`, {
    signal: options.signal,
  })
  const data = payload as Partial<MaterialListPayload> | null
  return {
    total: typeof data?.total === 'number' ? data.total : 0,
    items: Array.isArray(data?.items) ? data.items : [],
    stats: data?.stats ?? {
      total: 0,
      indexed: 0,
      indexing: 0,
      totalChunks: 0,
      totalSizeMB: 0,
    },
  }
}

/** Upload byte file + antre ingest RAG riil (parse/split/embed di backend).
 *
 * Mengirim FormData ke POST /api/materials/upload. `courseId` diisi saat
 * FilesPage difilter per matkul supaya materi masuk offering semester aktif
 * dan `ragFiles/ragChunks` kartu itu bertambah. Status awal `queued`;
 * panggil `fetchMaterials` berulang sampai `indexed`/`error`.
 */
export async function uploadMaterials(
  files: File[],
  options: { courseId?: string | null; folderId?: string | null; signal?: AbortSignal } = {},
): Promise<FileDoc[]> {
  if (files.length === 0) return []
  const form = new FormData()
  for (const file of files.slice(0, 20)) form.append('files', file, file.name)
  const params = new URLSearchParams()
  if (options.courseId) params.set('course_id', options.courseId)
  if (options.folderId) params.set('folder_id', options.folderId)
  const query = params.toString()
  let response: Response
  try {
    response = await fetch(
      `${SIDECAR_BASE_URL}/api/materials/upload${query ? `?${query}` : ''}`,
      { method: 'POST', body: form, signal: options.signal },
    )
  } catch {
    throw new CoursesApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  return Array.isArray(payload) ? (payload as FileDoc[]) : []
}

/** Catat file hasil dropzone. Metadata saja; byte file belum diproses. */
export async function registerMaterials(
  files: {
    name: string
    kind?: string
    sizeMB?: number
    offeringId?: string | null
  }[],
  options: { signal?: AbortSignal } = {},
): Promise<FileDoc[]> {
  if (files.length === 0) return []
  const payload = await request('/api/materials', {
    method: 'POST',
    body: { files },
    signal: options.signal,
  })
  return Array.isArray(payload) ? (payload as FileDoc[]) : []
}

/** Perbarui status indexing satu file (dipakai loop simulasi di FilesPage). */
export async function updateMaterial(
  materialId: string,
  patch: {
    status?: FileDoc['status']
    progress?: number
    chunkCount?: number
    sub?: string
  },
  options: { signal?: AbortSignal } = {},
): Promise<FileDoc | null> {
  const payload = await request(
    `/api/materials/${encodeURIComponent(materialId)}`,
    { method: 'PATCH', body: patch, signal: options.signal },
  )
  return (payload as FileDoc | null) ?? null
}

export async function fetchFolders(
  options: { signal?: AbortSignal } = {},
): Promise<FileFolder[]> {
  const payload = await request('/api/folders', { signal: options.signal })
  const data = payload as { folders?: FileFolder[] } | null
  return Array.isArray(data?.folders) ? data.folders : []
}

export type FolderCreateBody = {
  name: string
  icon?: 'folder' | 'shared' | 'code' | 'lock'
  badgeTone?: 'rag' | 'shared' | 'vector' | 'confidential'
  badgeLabel?: string
  /** Course.id untuk folder scope matkul; kosong = folder global. */
  courseId?: string | null
}

/**
 * Buat folder virtual baru. `courseId` (Course.id) di-resolve ke offering
 * semester aktif — sama seperti upload. 409 kalau nama sudah dipakai di
 * scope yang sama.
 */
export async function createFolder(
  body: FolderCreateBody,
  options: { signal?: AbortSignal } = {},
): Promise<FileFolder> {
  const payload = await request('/api/folders', {
    method: 'POST',
    body: {
      name: body.name,
      ...(body.icon ? { icon: body.icon } : {}),
      ...(body.badgeTone ? { badgeTone: body.badgeTone } : {}),
      ...(body.badgeLabel?.trim() ? { badgeLabel: body.badgeLabel.trim() } : {}),
      ...(body.courseId ? { courseId: body.courseId } : {}),
    },
    signal: options.signal,
  })
  return payload as FileFolder
}

/**
 * Pindahkan satu berkas ke folder (`null` = keluarkan jadi file lepas).
 * 404 kalau file atau foldernya tidak ada.
 */
export async function moveMaterial(
  materialId: string,
  folderId: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<FileDoc | null> {
  const payload = await request(
    `/api/materials/${encodeURIComponent(materialId)}`,
    { method: 'PATCH', body: { folderId }, signal: options.signal },
  )
  return (payload as FileDoc | null) ?? null
}

/** Ganti nama berkas. ID tidak berubah. */
export async function renameMaterial(
  materialId: string,
  name: string,
  options: { signal?: AbortSignal } = {},
): Promise<FileDoc | null> {
  const payload = await request(
    `/api/materials/${encodeURIComponent(materialId)}`,
    { method: 'PATCH', body: { name }, signal: options.signal },
  )
  return (payload as FileDoc | null) ?? null
}

/**
 * Hapus berkas permanen (baris + chunks + byte disk).
 *
 * Melaporkan `deleted: 0` sebagai throw supaya UI tidak diam-diam gagal.
 */
export async function deleteMaterial(
  materialId: string,
  options: { signal?: AbortSignal } = {},
): Promise<number> {
  const payload = await request(
    `/api/materials/${encodeURIComponent(materialId)}`,
    { method: 'DELETE', signal: options.signal },
  )
  const deleted = (payload as { deleted?: number } | null)?.deleted
  if (typeof deleted !== 'number' || deleted < 1) {
    throw new CoursesApiError('Berkas tidak dihapus.', 500)
  }
  return deleted
}

/** Ganti nama / ikon folder. Nama duplikat per scope → 409. */
export async function updateFolder(
  folderId: string,
  body: { name?: string; icon?: 'folder' | 'shared' | 'code' | 'lock' },
  options: { signal?: AbortSignal } = {},
): Promise<FileFolder> {
  const payload = await request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    body,
    signal: options.signal,
  })
  return payload as FileFolder
}

export type FolderDeleteResult = { deleted: number; released: number }

/**
 * Hapus folder permanen. Isi (`released`) otomatis jadi file lepas —
 * dialog konfirmasi memakai angka ini supaya pengguna tahu konsekuensinya.
 */
export async function deleteFolder(
  folderId: string,
  options: { signal?: AbortSignal } = {},
): Promise<FolderDeleteResult> {
  const payload = await request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
    signal: options.signal,
  })
  const data = (payload as Partial<FolderDeleteResult> | null) ?? {}
  if (data.deleted !== 1) {
    throw new CoursesApiError('Folder tidak dihapus.', 500)
  }
  return { deleted: 1, released: data.released ?? 0 }
}

export { isAbort as isCoursesAbort }
