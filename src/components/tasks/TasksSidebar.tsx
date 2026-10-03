import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { CalendarClock, Check, ListTodo, MoreHorizontal, Plus, Search, Star } from 'lucide-react'
import { QUICK_VIEWS, type QuickViewId, type TaskWorkflowItem } from '@/data/tasks'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/hooks/useSidebarWidth'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { SidebarTransition } from '@/components/feedback'

const QUICK_ICONS: Record<QuickViewId, typeof Check> = {
  my: Check,
  priority: Star,
  due: CalendarClock,
}

type Props = {
  open: boolean
  width: number
  dragging: boolean
  query: string
  onQueryChange: (q: string) => void
  onNewTask: () => void
  activeQuick: QuickViewId | null
  onSelectQuick: (id: QuickViewId) => void
  counts: Record<QuickViewId, number>
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onClose: () => void
  semesterProgress?: { percent: number; done: number; total: number }
  workflows?: TaskWorkflowItem[]
}

export function TasksSidebar({
  open,
  width,
  dragging,
  query,
  onQueryChange,
  onNewTask,
  activeQuick,
  onSelectQuick,
  counts,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onClose,
  semesterProgress = { percent: 75, done: 18, total: 24 },
  workflows = [],
}: Props) {
  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 50 : 10
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onResizeNudge(-step)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onResizeNudge(step)
    }
  }

  return (
    <>
      <SidebarTransition
        open={open}
        width={width}
        dragging={dragging}
        onClose={onClose}
        className="fixed left-[var(--rail-w)] top-0 z-40 flex h-full flex-col bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
      >
        <aside
          aria-label="Tasks and projects"
          className="flex h-full w-[var(--sbw-actual,280px)] flex-col"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <ListTodo className="size-5 shrink-0 text-secondary" aria-hidden="true" />
                <span className="truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
                  My Tasks
                </span>
              </div>
              <Button variant="tool" size="icon-sm" aria-label="More options" className="shrink-0">
                <MoreHorizontal className="size-[18px]" aria-hidden="true" />
              </Button>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 size-[18px] text-on-surface-variant"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Filter tasks..."
                type="text"
                aria-label="Filter tasks"
                className="w-full rounded-lg bg-surface-container-lowest py-2 pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-[0_1px_4px_rgba(0,0,0,0.02)] placeholder:text-on-surface-variant focus:outline-none"
              />
            </div>

            <Button variant="primary" size="md" onClick={onNewTask} className="h-10 w-full">
              <Plus className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">New Task</span>
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Quick Views
              </span>
              <nav className="flex flex-col gap-0.5" aria-label="Quick views">
                {QUICK_VIEWS.map((item) => {
                  const Icon = QUICK_ICONS[item.id]
                  const active = activeQuick === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectQuick(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                        active
                          ? 'bg-surface-container-high font-semibold text-on-surface'
                          : 'font-body-md text-body-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={cn(
                            'size-[18px] shrink-0',
                            item.id === 'due' ? 'text-secondary' : 'text-on-surface-variant',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span
                        className={cn(
                          'min-w-7 shrink-0 rounded-full px-2 py-0.5 text-center font-label-sm text-label-sm font-semibold tabular-nums',
                          item.urgent
                            ? 'bg-error-container text-error'
                            : 'bg-surface-container-lowest text-text-secondary',
                        )}
                      >
                        {counts[item.id]}
                      </span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Active Workflows
              </span>
              <div className="flex flex-col gap-0.5">
                {workflows.map((w) => (
                  <a
                    key={w.id}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-body-sm text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('size-2 shrink-0 rounded-full', w.dot)} aria-hidden="true" />
                      <span className="truncate">{w.label}</span>
                    </span>
                    <span className="shrink-0 font-label-sm text-label-sm text-text-secondary">{w.count}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3">
            <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-label-md text-label-md text-on-surface">Semester Progress</span>
                <span className="shrink-0 font-label-md text-label-md font-semibold text-secondary">{semesterProgress.percent}%</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-valuenow={semesterProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Semester progress"
              >
                <div className={`h-full w-[${semesterProgress.percent}%] rounded-full bg-secondary-container`} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-body-sm text-body-sm text-text-secondary">
                  {semesterProgress.done} of {semesterProgress.total} assignments done
                </span>
                <span className="shrink-0 font-label-sm text-label-sm font-medium text-success-emerald">+{semesterProgress.done - Math.round(semesterProgress.total * 0.63)}%</span>
              </div>
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={Math.round(width)}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            tabIndex={open ? 0 : -1}
            onPointerDown={onResizeStart}
            onDoubleClick={onResizeReset}
            onKeyDown={onHandleKeyDown}
            className={`absolute right-0 top-0 hidden h-full w-3 cursor-col-resize touch-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-secondary md:block ${
              dragging ? 'bg-secondary' : 'bg-transparent hover:bg-secondary/40'
            }`}
          />
        </aside>
      </SidebarTransition>
    </>
  )
}
