import { ArrowUpDown, BookOpen, FlaskConical, Globe, Search } from 'lucide-react'
import type { CoursesSort, CoursesTab } from '@/data/courses'
import { cn } from '@/utils/cn'

const TAB_OPTIONS: { id: CoursesTab; label: string; icon: typeof Globe }[] = [
  { id: 'all', label: 'Semua', icon: Globe },
  { id: 'teori', label: 'Teori', icon: BookOpen },
  { id: 'praktikum', label: 'Praktikum', icon: FlaskConical },
]

function sortLabel(s: CoursesSort) {
  return s === 'name' ? 'Name' : s === 'sks' ? 'SKS' : 'Progress'
}

type Props = {
  query: string
  onQueryChange: (q: string) => void
  tab: CoursesTab
  onTabChange: (t: CoursesTab) => void
  sort: CoursesSort
  onSortCycle: () => void
  searchId?: string
}

export function CoursesFilterBar({
  query,
  onQueryChange,
  tab,
  onTabChange,
  sort,
  onSortCycle,
  searchId = 'course-search',
}: Props) {
  const dropBtn =
    'inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container'

  return (
    <section
      className="flex flex-col justify-between gap-3 rounded-2xl bg-surface-card p-3 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:flex-row lg:items-center"
      aria-label="Filter courses"
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
          placeholder="Cari matkul, kode, dosen, atau tutor..."
          type="text"
          aria-label="Search courses"
          className="w-full rounded-full bg-surface py-2 pl-10 pr-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus:bg-surface-container-low focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full bg-surface p-1" role="group" aria-label="Jenis matkul">
          {TAB_OPTIONS.map((o) => {
            const Icon = o.icon
            const active = o.id === tab
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onTabChange(o.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-label-md text-label-md transition-all',
                  active
                    ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {o.label}
              </button>
            )
          })}
        </div>

        <button type="button" onClick={onSortCycle} className={dropBtn}>
          <ArrowUpDown className="size-4 text-text-secondary" aria-hidden="true" />
          <span>Sort: {sortLabel(sort)}</span>
        </button>
      </div>
    </section>
  )
}
