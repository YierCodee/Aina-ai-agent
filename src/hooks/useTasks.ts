import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bulkCompleteTasks,
  createTask,
  deleteTask,
  fetchTaskWorkflows,
  fetchTasks,
  isTasksAbort,
  toggleTask,
  type CreateTaskInput,
} from '@/lib/tasksApi'
import type {
  PriorityFilter,
  QuickViewId,
  TaskItem,
  TasksCounts,
  TasksMetrics,
  TaskWorkflowItem,
  TasksSort,
} from '@/data/tasks'

export { type CreateTaskInput }

const EMPTY_COUNTS: TasksCounts = { my: 0, priority: 0, due: 0 }
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

export type UseTasksFilters = {
  query: string
  sidebarQuery: string
  priority: PriorityFilter
  quick: QuickViewId | null
  sort: TasksSort
}

export type UseTasksResult = {
  items: TaskItem[]
  counts: Record<QuickViewId, number>
  metrics: TasksMetrics
  workflows: TaskWorkflowItem[]
  loading: boolean
  error: string | null
  refetch: () => void
  addTask: (input: CreateTaskInput) => Promise<TaskItem>
  toggleTask: (id: string) => Promise<TaskItem>
  deleteTask: (id: string) => Promise<void>
  bulkComplete: () => Promise<number>
}

const DEBOUNCE_MS = 220

export function useTasks(filters: UseTasksFilters): UseTasksResult {
  const { query, sidebarQuery, priority, quick, sort } = filters
  const [items, setItems] = useState<TaskItem[]>([])
  const [counts, setCounts] = useState<TasksCounts>(EMPTY_COUNTS)
  const [metrics, setMetrics] = useState<TasksMetrics>(EMPTY_METRICS)
  const [workflows, setWorkflows] = useState<TaskWorkflowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  /**
   * true selama belum ada request yang selesai. Debounce 220ms itu untuk
   * menahan ketikan di search/filter; menunggu yang sama pada load awal hanya
   * menambah waktu kosong sebelum task pertama tampil, jadi request pertama
   * dikirim seketika.
   *
   * Penandanya `ref`, bukan `hasLoaded` di dependency — kalau `hasLoaded`
   * masuk dependency, effect akan jalan lagi saat nilainya berubah dan menarik
   * data dua kali.
   *
   * Diturunkan ke `false` di dalam `finally` (bukan di awal effect) supaya
   * `StrictMode` aman: mount → effect#1 (delay 0) → cleanup → effect#2 masih
   * membaca `true` karena request belum selesai, jadi tetap delay 0.
   */
  const awaitingFirstResponse = useRef(true)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(
      () => {
        setError(null)
        void (async () => {
          try {
            const [listing, workflowItems] = await Promise.all([
              fetchTasks(
                { query, sidebarQuery, priority, quick, sort },
                { signal: controller.signal },
              ),
              fetchTaskWorkflows({ signal: controller.signal }),
            ])
            setItems(listing.items)
            setCounts(listing.counts)
            setMetrics(listing.metrics)
            setWorkflows(workflowItems)
          } catch (e) {
            if (isTasksAbort(e)) return
            setError(e instanceof Error ? e.message : 'Gagal memuat tasks.')
            setItems([])
            setCounts(EMPTY_COUNTS)
            setMetrics(EMPTY_METRICS)
            setWorkflows([])
          } finally {
            if (!controller.signal.aborted) {
              // Diturunkan di sini juga, bukan hanya di jalur sukses: kalau
              // request awal gagal dan flag tetap `true`, setiap ketikan di
              // search akan menembak API tanpa jeda.
              awaitingFirstResponse.current = false
              setHasLoaded(true)
              setLoading(false)
            }
          }
        })()
      },
      awaitingFirstResponse.current ? 0 : DEBOUNCE_MS,
    )

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, sidebarQuery, priority, quick, sort, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  const addTask = useCallback(
    async (input: CreateTaskInput) => {
      const created = await createTask(input)
      refetch()
      return created
    },
    [refetch],
  )

  const handleToggle = useCallback(
    async (id: string) => {
      const updated = await toggleTask(id)
      refetch()
      return updated
    },
    [refetch],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTask(id)
      refetch()
    },
    [refetch],
  )

  const handleBulkComplete = useCallback(async () => {
    const result = await bulkCompleteTasks({ query, sidebarQuery, priority })
    refetch()
    return result.completed
  }, [query, sidebarQuery, priority, refetch])

  return useMemo(
    () => ({
      items,
      counts: { my: counts.my, priority: counts.priority, due: counts.due },
      metrics,
      workflows,
      loading: loading && !hasLoaded,
      error,
      refetch,
      addTask,
      toggleTask: handleToggle,
      deleteTask: handleDelete,
      bulkComplete: handleBulkComplete,
    }),
    [
      items,
      counts,
      metrics,
      workflows,
      loading,
      hasLoaded,
      error,
      refetch,
      addTask,
      handleToggle,
      handleDelete,
      handleBulkComplete,
    ],
  )
}