import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  ListChecks,
  Search,
} from 'lucide-react'
import type { PriorityFilter, TasksSort } from '@/data/tasks'
import { cn } from '@/utils/cn'

const PRIORITY_OPTIONS: { id: PriorityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High Priority' },
  { id: 'medium', label: 'Medium' },
  { id: 'normal', label: 'Normal' },
]

function sortLabel(s: TasksSort) {
  return s === 'due' ? 'Due Date' : s === 'priority' ? 'Priority' : 'Name'
}

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return ref
}

type Props = {
  query: string
  onQueryChange: (q: string) => void
  priority: PriorityFilter
  onPriorityChange: (p: PriorityFilter) => void
  sort: TasksSort
  onSortCycle: () => void
  onBulkComplete: () => void
  searchId?: string
}

export function TasksFilterBar({
  query,
  onQueryChange,
  priority,
  onPriorityChange,
  sort,
  onSortCycle,
  onBulkComplete,
  searchId = 'task-search',
}: Props) {
  const [openMenu, setOpenMenu] = useState<'priority' | null>(null)
  const close = () => setOpenMenu(null)
  const menuRef = useDismiss(openMenu !== null, close)

  const activePriority = PRIORITY_OPTIONS.find((o) => o.id === priority)?.label ?? 'All'

  const dropBtn =
    'inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container'

  const optionCls = (active: boolean) =>
    cn(
      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-label-md text-label-md transition-colors hover:bg-surface-container-low',
      active ? 'text-text-primary' : 'text-on-surface-variant',
    )

  return (
    <section
      className="flex flex-col justify-between gap-3 rounded-2xl bg-surface-card p-3 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:flex-row lg:items-center"
      aria-label="Filter and view tasks"
    >
      <div className="relative min-w-[280px] flex-1">
        <Search
          className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-text-secondary"
          aria-hidden="true"
        />
        <input
          id={searchId}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search assignments, tags..."
          type="text"
          aria-label="Search tasks"
          className="w-full rounded-full bg-surface py-2 pl-10 pr-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus:bg-surface-container-low focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2" ref={menuRef}>
        <div className="inline-flex items-center rounded-full bg-surface p-1" role="group" aria-label="View mode">
          <button
            type="button"
            aria-pressed="true"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-3.5 py-1.5 font-label-md text-label-md font-semibold text-text-primary shadow-sm"
          >
            <List className="size-4" aria-hidden="true" />
            List View
          </button>
          <button
            type="button"
            disabled
            title="Kanban — segera hadir"
            aria-label="Kanban view (segera hadir)"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full px-3.5 py-1.5 font-label-md text-label-md text-text-secondary opacity-60"
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            Kanban
          </button>
          <button
            type="button"
            disabled
            title="Calendar — segera hadir"
            aria-label="Calendar view (segera hadir)"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full px-3.5 py-1.5 font-label-md text-label-md text-text-secondary opacity-60"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            Calendar
          </button>
        </div>

        <span className="hidden h-6 w-px bg-surface-container sm:block" aria-hidden="true" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'priority' ? null : 'priority')}
            aria-haspopup="listbox"
            aria-expanded={openMenu === 'priority'}
            className={dropBtn}
          >
            <span>Priority: {activePriority}</span>
            <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
          </button>
          {openMenu === 'priority' && (
            <div role="listbox" aria-label="Filter by priority" className="absolute left-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === priority}
                  onClick={() => {
                    onPriorityChange(o.id)
                    close()
                  }}
                  className={optionCls(o.id === priority)}
                >
                  <span>{o.label}</span>
                  {o.id === priority && <Check className="size-4" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={onSortCycle} className={dropBtn}>
          <ArrowUpDown className="size-4 text-text-secondary" aria-hidden="true" />
          <span>Sort: {sortLabel(sort)}</span>
        </button>
        <button
          type="button"
          onClick={onBulkComplete}
          title="Tandai semua task terlihat sebagai selesai"
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 font-label-md text-label-md text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
        >
          <ListChecks className="size-4" aria-hidden="true" />
          <span>Bulk</span>
        </button>
      </div>
    </section>
  )
}
