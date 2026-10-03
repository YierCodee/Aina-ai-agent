import { Layers, Menu, Plus, Share2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Props = {
  onAddTask: () => void
  onToggleSidebar: () => void
  onFilterClick: () => void
  onSortCycle: () => void
}

export function TasksTopbar({ onAddTask, onToggleSidebar, onFilterClick, onSortCycle }: Props) {
  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-border-subtle bg-surface/85 backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="tool"
            size="icon-sm"
            className="shrink-0 md:hidden"
            aria-label="Toggle tasks sidebar"
            onClick={onToggleSidebar}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-2 font-label-md text-label-md text-text-secondary">
            <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors hover:text-on-surface">
              Workspace
            </a>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-on-surface">Tasks &amp; Execution</span>
          </div>
          <span className="hidden h-4 w-px bg-surface-container-high sm:block" aria-hidden="true" />
          <Badge tone="card" className="hidden text-on-surface shadow-[0_1px_4px_rgba(0,0,0,0.03)] sm:inline-flex">
            <span className="size-2 rounded-full bg-success-emerald" aria-hidden="true" />
            3 Study Assistants Active
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="md" onClick={onFilterClick} className="hidden sm:inline-flex">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span>Filter</span>
          </Button>
          <Button variant="ghost" size="md" onClick={onSortCycle} className="hidden sm:inline-flex">
            <Layers className="size-4" aria-hidden="true" />
            <span>Group by</span>
          </Button>
          <Button variant="ghost" size="md" className="hidden sm:inline-flex" aria-label="Share (segera hadir)" disabled>
            <Share2 className="size-4" aria-hidden="true" />
            <span>Share</span>
          </Button>
          <Button variant="primary" size="md" onClick={onAddTask}>
            <Plus className="size-4" aria-hidden="true" />
            <span>Add Task</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
