/**
 * Klien endpoint Tasks/Copilot untuk FastAPI sidecar.
 *
 * Mengikuti `lib/coursesApi.ts`: `fetch` langsung ke `SIDECAR_BASE_URL`.
 * Bentuk tipe di sini adalah cermin dari `backend/schemas/tasks.py`.
 */
import { SIDECAR_BASE_URL } from '@/lib/sidecar'
import type {
  PriorityFilter,
  QuickViewId,
  TaskItem,
  TasksListPayload,
  TasksMetrics,
  TaskWorkflowItem,
  TasksSort,
} from '@/data/tasks'

export class TasksApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'TasksApiError'
    this.status = status
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  404: 'Data tidak ditemukan.',
  409: 'Data bentrok dengan data yang sudah ada.',
  422: 'Permintaan tidak valid.',
  500: 'Backend gagal memproses permintaan.',
  503: 'Backend belum siap. Periksa log sidecar.',
}

const OFFLINE_MESSAGE = 'Tidak bisa menghubungi sidecar. Pastikan backend berjalan.'
const SCHEMA_MESSAGE =
  'Skema database belum sesuai. Jalankan `alembic upgrade head` di repo backend.'

function readErrorDetail(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const detail = (payload as { detail?: unknown }).detail
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null
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
  const message = detail ?? STATUS_MESSAGES[response.status] ?? 'Terjadi kesalahan.'
  throw new TasksApiError(
    /alembic upgrade head/i.test(message) ? SCHEMA_MESSAGE : message,
    response.status,
  )
}

function isAbort(error: unknown): boolean {
  return error instanceof TasksApiError && error.message === 'Permintaan dibatalkan.'
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
    if (isAbort(cause)) throw new TasksApiError('Permintaan dibatalkan.', null)
    void cause
    throw new TasksApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  return payload
}

export function isTasksAbort(error: unknown): boolean {
  return isAbort(error)
}

export type TaskQuery = {
  query?: string
  sidebarQuery?: string
  priority?: PriorityFilter
  sort?: TasksSort
  quick?: QuickViewId | null
}

function taskParams(query: TaskQuery): string {
  const params = new URLSearchParams()
  if (query.query?.trim()) params.set('query', query.query.trim())
  if (query.sidebarQuery?.trim()) params.set('sidebar_query', query.sidebarQuery.trim())
  if (query.priority && query.priority !== 'all') params.set('priority', query.priority)
  if (query.sort) params.set('sort', query.sort)
  if (query.quick) params.set('quick', query.quick)
  return params.toString()
}

const EMPTY_METRICS: TasksMetrics = {
  activeWorkload: 0,
  activeWorkloadCreatedToday: 0,
  completedThisWeek: 0,
  dueToday: 0,
  dueTodayUrgent: 0,
  semesterCompletion: 0,
  semesterDone: 0,
  semesterTotal: 0,
}

export async function fetchTasks(
  query: TaskQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<TasksListPayload> {
  const payload = await request(`/api/tasks?${taskParams(query)}`, { signal: options.signal })
  const data = payload as Partial<TasksListPayload> | null
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    counts: data?.counts ?? { my: 0, priority: 0, due: 0 },
    metrics: { ...EMPTY_METRICS, ...(data?.metrics ?? {}) },
  }
}

export type CreateTaskInput = {
  title: string
  priority: TaskItem['priority']
  group: TaskItem['group']
  dueAt?: string | null
  scheduleKind?: 'deadline' | 'continuous' | 'done'
  note?: string | null
  tags?: string[]
  workflowId?: string | null
  actionLabel?: string
  actionKind?: TaskItem['action']['kind']
  actionUrl?: string | null
  source?: 'manual' | 'lms' | 'copilot'
}

export async function createTask(input: CreateTaskInput): Promise<TaskItem> {
  const payload = await request('/api/tasks', { method: 'POST', body: input })
  return payload as TaskItem
}

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: 'open' | 'done'
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<TaskItem> {
  const payload = await request(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
  return payload as TaskItem
}

export async function toggleTask(id: string): Promise<TaskItem> {
  const payload = await request(`/api/tasks/${encodeURIComponent(id)}/toggle`, { method: 'POST' })
  return payload as TaskItem
}

export async function deleteTask(id: string): Promise<{ deleted: boolean }> {
  const payload = await request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return payload as { deleted: boolean }
}

export async function bulkCompleteTasks(options: {
  query?: string
  sidebarQuery?: string
  priority?: PriorityFilter
}): Promise<{ completed: number }> {
  const params = new URLSearchParams()
  if (options.query?.trim()) params.set('query', options.query.trim())
  if (options.sidebarQuery?.trim()) params.set('sidebar_query', options.sidebarQuery.trim())
  if (options.priority && options.priority !== 'all') params.set('priority', options.priority)
  const payload = await request(`/api/tasks/bulk-complete?${params.toString()}`, { method: 'POST' })
  return payload as { completed: number }
}

export async function fetchTaskWorkflows(options: { signal?: AbortSignal } = {}): Promise<TaskWorkflowItem[]> {
  const payload = await request('/api/tasks/workflows', { signal: options.signal })
  const data = payload as { items?: TaskWorkflowItem[] } | null
  return Array.isArray(data?.items) ? data.items : []
}
