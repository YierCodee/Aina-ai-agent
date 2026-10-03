import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { type PriorityFilter, type QuickViewId, type TasksSort } from '@/data/tasks'
import { TasksSidebar } from '@/components/tasks/TasksSidebar'
import { TasksTopbar } from '@/components/tasks/TasksTopbar'
import { FixedLayer } from '@/components/feedback/FixedLayer'
import { PageSkeleton } from '@/components/feedback/PageSkeleton'
import { TasksMetrics } from '@/components/tasks/TasksMetrics'
import { TasksFilterBar } from '@/components/tasks/TasksFilterBar'
import { TaskCard, TaskGroup } from '@/components/tasks/TaskCard'
import {
  TaskCreateDialog,
  type TaskCreateBody,
} from '@/components/tasks/TaskCreateDialog'
import { Button } from '@/components/ui/button'
import { useTasks, type CreateTaskInput } from '@/hooks/useTasks'
import { isTasksAbort } from '@/lib/tasksApi'

type Props = {
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarDragging: boolean
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onToggleSidebar: () => void
  onCloseSidebar: () => void
}

export function TasksPage({
  sidebarOpen,
  sidebarWidth,
  sidebarDragging,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onToggleSidebar,
  onCloseSidebar,
}: Props) {
  const [query, setQuery] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [activeQuick, setActiveQuick] = useState<QuickViewId | null>(null)
  const [sort, setSort] = useState<TasksSort>('due')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const {
    items: tasks,
    counts,
    metrics,
    workflows,
    loading,
    error,
    refetch,
    addTask,
    toggleTask,
    deleteTask,
    bulkComplete,
  } = useTasks({ query, sidebarQuery, priority, quick: activeQuick, sort })

  const flash = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const cycleSort = () =>
    setSort((s) => (s === 'due' ? 'priority' : s === 'priority' ? 'name' : 'due'))

  const resetLocalFilters = () => {
    setQuery('')
    setPriority('all')
    setSort('due')
    setActiveQuick(null)
  }

  const handleSelectQuick = (id: QuickViewId) => {
    setActiveQuick(id)
  }

  const openCreateDialog = () => {
    setCreateError(null)
    setCreateOpen(true)
  }

  const closeCreateDialog = () => {
    if (createBusy) return
    setCreateOpen(false)
    setCreateError(null)
  }

  /**
   * Task tanpa tenggat tetap valid — hanya `group` yang perlu turunan, karena
   * backend tidak menentukannya sendiri. Tenggat hari ini masuk "Today's
   * Priorities", sisanya "Upcoming".
   */
  const taskGroup = (dueAt: string | null): CreateTaskInput['group'] => {
    if (!dueAt) return 'upcoming'
    const due = new Date(dueAt)
    const now = new Date()
    const sameDay =
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate()
    return sameDay ? 'today' : 'upcoming'
  }

  const submitCreateTask = (body: TaskCreateBody) => {
    if (createBusy) return
    setCreateBusy(true)
    setCreateError(null)
    void (async () => {
      try {
        await addTask({
          title: body.title,
          priority: body.priority,
          group: taskGroup(body.dueAt),
          dueAt: body.dueAt,
          // `continuous` = tidak ada tenggat; inilah cara backend menyimpan
          // task dengan `due_at` kosong (lihat `services/task_service.py`).
          scheduleKind: body.dueAt ? 'deadline' : 'continuous',
          note: body.note,
          tags: body.tags,
          workflowId: body.workflowId,
          actionLabel: body.actionLabel,
          actionKind: body.actionKind,
          source: 'manual',
        })
        setCreateOpen(false)
        resetLocalFilters()
        flash('Task added.')
      } catch (e) {
        if (isTasksAbort(e)) return
        // Pesan dari `TasksApiError` sudah berbahasa manusia — tampilkan apa adanya.
        setCreateError(e instanceof Error ? e.message : 'Gagal menambah task.')
      } finally {
        setCreateBusy(false)
      }
    })()
  }

  const handleBulkComplete = async () => {
    const completed = await bulkComplete()
    if (completed === 0) {
      flash('All visible tasks are already done.')
    } else {
      flash(`${completed} task(s) marked as done.`)
    }
  }

  const handleAction = (task: { action: { label: string }; title: string }) => {
    flash(`${task.action.label} opened for "${task.title}".`)
  }

  const focusSearch = () => document.getElementById('task-search')?.focus()

  const today = tasks.filter((t) => t.group === 'today')
  const upcoming = tasks.filter((t) => t.group === 'upcoming')

  const semesterProgress = {
    percent: metrics.semesterCompletion,
    done: metrics.semesterDone,
    total: metrics.semesterTotal,
  }

  return (
    <>
      <FixedLayer>
        <TasksSidebar
          open={sidebarOpen}
          width={sidebarWidth}
          dragging={sidebarDragging}
          query={sidebarQuery}
          onQueryChange={setSidebarQuery}
          onNewTask={openCreateDialog}
          activeQuick={activeQuick}
          onSelectQuick={handleSelectQuick}
          counts={counts}
          semesterProgress={semesterProgress}
          workflows={workflows}
          onResizeStart={onResizeStart}
          onResizeNudge={onResizeNudge}
          onResizeReset={onResizeReset}
          onClose={onCloseSidebar}
        />
      </FixedLayer>

      <TasksTopbar
        onAddTask={openCreateDialog}
        onToggleSidebar={onToggleSidebar}
        onFilterClick={focusSearch}
        onSortCycle={cycleSort}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6">
        {/*
          Hanya satu dari tiga yang tampil. Pola yang sama dengan `CoursesPage`:
          halaman yang meredam layar sendiri (overlay spinner + overlay error)
          bikin dua kali transisi saat pertama buka — shimmer dari Suspense,
          lalu layar gelap yang menutupinya.
        */}
        {loading ? (
          // Padding & gap skeleton di-override: komponennya sudah membawa
          // container sendiri, sedangkan kita sudah berada di dalam container
          // yang sudah berpadding. Tanpa `sm:px-0` variant `sm:px-6`-nya tidak
          // tertimpa (twMerge hanya menimpa modifier yang sama).
          <PageSkeleton variant="tasks" className="px-0 py-0 sm:px-0" />
        ) : error ? (
          <section
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl bg-surface-card p-8 shadow-sm"
          >
            <span className="flex items-center gap-2 text-error">
              <TriangleAlert className="size-5" aria-hidden="true" />
              <span className="font-headline-sm text-headline-sm font-semibold">
                Data task tidak bisa dimuat
              </span>
            </span>
            <p className="max-w-xl font-body-sm text-body-sm text-text-secondary">{error}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={refetch}>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Coba lagi</span>
              </Button>
            </div>
          </section>
        ) : (
          <>
            <TasksMetrics metrics={metrics} />
            <TasksFilterBar
              query={query}
              onQueryChange={setQuery}
              priority={priority}
              onPriorityChange={setPriority}
              sort={sort}
              onSortCycle={cycleSort}
              onBulkComplete={handleBulkComplete}
              searchId="task-search"
            />

            <div className="flex flex-col gap-8">
              <TaskGroup title="Today's Priorities" dot="bg-error" count={today.length} actionLabel="Reorder queue">
                {today.map((t) => (
                  <TaskCard key={t.id} task={t} onToggle={toggleTask} onAction={handleAction} onDelete={deleteTask} />
                ))}
                {today.length === 0 && (
                  <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary">
                    No tasks match the current filters. Try another keyword or reset filters.
                  </p>
                )}
              </TaskGroup>

              <TaskGroup title="Upcoming & In Progress" dot="bg-secondary" count={upcoming.length} actionLabel="View archive">
                {upcoming.map((t) => (
                  <TaskCard key={t.id} task={t} onToggle={toggleTask} onAction={handleAction} onDelete={deleteTask} />
                ))}
                {upcoming.length === 0 && (
                  <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary">
                    No upcoming tasks match the current filters.
                  </p>
                )}
              </TaskGroup>
            </div>
          </>
        )}

        {toast && (
          <FixedLayer>
            <div
              role="status"
              className="fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-text-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-lg"
            >
              {toast}
            </div>
          </FixedLayer>
        )}
      </div>

      {/*
        Dialog di-portal sendiri oleh Radix, jadi tidak terkena masalah
        `filter: blur()` di `PageTransition` yang membuat `position: fixed`
        meleset — tidak perlu dibungkus `FixedLayer`.
      */}
      <TaskCreateDialog
        open={createOpen}
        busy={createBusy}
        error={createError}
        workflows={workflows}
        onClose={closeCreateDialog}
        onSubmit={submitCreateTask}
      />
    </>
  )
}