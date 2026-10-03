import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BookOpen, FlaskConical, GraduationCap, LayoutGrid, MoreHorizontal, Plus, Search, TrendingDown } from 'lucide-react'
import { COURSE_QUICK_VIEWS, type CourseCounts, type CourseMetrics, type CourseQuickViewId } from '@/data/courses'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/hooks/useSidebarWidth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { SidebarTransition } from '@/components/feedback'

const QUICK_ICONS: Record<CourseQuickViewId, typeof LayoutGrid> = {
  all: LayoutGrid,
  teori: BookOpen,
  praktikum: FlaskConical,
  progress: TrendingDown,
}

type Props = {
  open: boolean
  width: number
  dragging: boolean
  query: string
  onQueryChange: (q: string) => void
  onNewCourse: () => void
  activeQuick: CourseQuickViewId
  onSelectQuick: (id: CourseQuickViewId) => void
  counts: CourseCounts
  metrics: CourseMetrics | null
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onClose: () => void
}

export function CoursesSidebar({
  open,
  width,
  dragging,
  query,
  onQueryChange,
  onNewCourse,
  activeQuick,
  onSelectQuick,
  counts,
  metrics,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onClose,
}: Props) {
  // Persentase offering yang punya namespace RAG sendiri. Kalau backend belum
  // menjawab, tampilkan 0 — bukan 100. Angka 100% yang dulu hardcode tidak
  // pernah bisa salah; sekarang bisa, dan justru itu gunanya.
  const isolation = metrics?.ragIsolation ?? 0

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
          aria-label="Courses and study"
          className="flex h-full w-[var(--sbw-actual,280px)] flex-col"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <GraduationCap className="size-5 shrink-0 text-secondary" aria-hidden="true" />
                <span className="truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
                  Courses
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
                placeholder="Filter matkul..."
                type="text"
                aria-label="Filter courses"
                className="w-full rounded-lg bg-surface-container-lowest py-2 pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-[0_1px_4px_rgba(0,0,0,0.02)] placeholder:text-on-surface-variant focus:outline-none"
              />
            </div>

            <Button variant="primary" size="md" onClick={onNewCourse} className="h-10 w-full">
              <Plus className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">Enroll Matkul</span>
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Quick Views
              </span>
              <nav className="flex flex-col gap-0.5" aria-label="Quick views">
                {COURSE_QUICK_VIEWS.map((item) => {
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
                        <Icon className="size-[18px] shrink-0 text-on-surface-variant" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="min-w-7 shrink-0 rounded-full bg-surface-container-lowest px-2 py-0.5 text-center font-label-sm text-label-sm font-semibold tabular-nums text-text-secondary">
                        {counts[item.id]}
                      </span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                AI Tutor Status
              </span>
              <div className="flex items-center justify-between gap-2 px-2">
                <span className="flex min-w-0 items-center gap-2 font-body-sm text-body-sm text-on-surface">
                  <span className="size-2 shrink-0 rounded-full bg-text-secondary" aria-hidden="true" />
                  <span className="truncate">
                    {metrics?.dedicatedTutors ?? 0} Dedicated Tutors
                  </span>
                </span>
                <Badge tone="neutral" className="shrink-0">
                  Running
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-3">
            <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-label-md text-label-md text-on-surface">Isolasi Konteks RAG</span>
                <span className="shrink-0 font-label-md text-label-md font-semibold text-secondary">
                  {isolation}%
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-valuenow={isolation}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Isolasi konteks RAG"
              >
                <div
                  className="h-full rounded-full bg-secondary-container"
                  style={{ width: `${isolation}%` }}
                />
              </div>
              <p className="font-body-sm text-body-sm text-text-secondary">
                Setiap matkul punya Vector Sandbox mandiri.
              </p>
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
