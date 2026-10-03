import { memo, useState } from 'react'
import {
  AlarmClock,
  CalendarDays,
  Check,
  FileText,
  ListChecks,
  MessageSquare,
  MoreVertical,
} from 'lucide-react'
import type { TaskActionKind, TaskItem, TaskPriority } from '@/data/tasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

function priorityTone(p: TaskPriority): 'danger' | 'neutral' {
  switch (p) {
    case 'urgent':
    case 'high':
      return 'danger'
    case 'medium':
    case 'normal':
    default:
      return 'neutral'
  }
}

function priorityLabel(p: TaskPriority) {
  switch (p) {
    case 'urgent':
      return 'Urgent'
    case 'high':
      return 'High Priority'
    case 'medium':
      return 'Medium'
    case 'normal':
    default:
      return 'Normal'
  }
}

function ActionIcon({ kind }: { kind: TaskActionKind }) {
  const cls = 'size-4'
  switch (kind) {
    case 'comment':
      return <MessageSquare className={cls} aria-hidden="true" />
    case 'open':
    default:
      return <FileText className={cls} aria-hidden="true" />
  }
}

type CardProps = {
  task: TaskItem
  onToggle: (id: string) => void
  onAction: (task: TaskItem) => void
  onDelete: (id: string) => void
}

export const TaskCard = memo(function TaskCard({ task, onToggle, onAction, onDelete }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const done = task.completed
  const visibleTags = task.tags.slice(0, 2)
  const extraTags = task.tags.length - visibleTags.length

  return (
    <article
      className={cn(
        'group flex flex-col justify-between gap-4 rounded-2xl bg-surface-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-colors duration-200 hover:bg-surface-container-lowest sm:p-5 md:flex-row md:items-center',
        done && 'opacity-70',
      )}
      aria-label={task.title}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5 md:items-center">
        <label className="relative mt-0.5 flex cursor-pointer items-center justify-center md:mt-0">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={done}
            onChange={() => onToggle(task.id)}
            aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          />
          <span
            aria-hidden="true"
            className={cn(
              'flex size-5 items-center justify-center rounded-lg transition-colors',
              done ? 'bg-primary-container text-on-primary' : 'bg-surface text-transparent',
            )}
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        </label>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                'min-w-0 truncate font-headline-sm text-headline-sm font-semibold text-text-primary',
                done && 'line-through decoration-2',
              )}
            >
              {task.title}
            </span>
            <Badge tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 text-text-secondary">
            <span className={cn('flex items-center gap-1 font-medium', task.dueTone === 'overdue' && 'text-error')}>
              {task.dueTone === 'overdue' ? (
                <AlarmClock className="size-4" aria-hidden="true" />
              ) : (
                <CalendarDays className="size-4" aria-hidden="true" />
              )}
              {task.due}
            </span>
            {task.subtask && (
              <span className="flex items-center gap-1.5">
                <ListChecks className="size-4" aria-hidden="true" />
                {task.subtask.done} of {task.subtask.total} done
              </span>
            )}
            {visibleTags.map((t) => (
              <span key={t} className="rounded-full bg-surface-container-low px-2 py-0.5 text-xs text-text-secondary">
                {t}
              </span>
            ))}
            {extraTags > 0 && <span className="text-xs">+{extraTags}</span>}
            {task.note && <span className="truncate text-xs">{task.note}</span>}
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-2.5 pt-2 md:w-auto md:pt-0">
        <Button variant="soft" size="md" onClick={() => onAction(task)}>
          <ActionIcon kind={task.action.kind} />
          <span>{task.action.label}</span>
        </Button>
        <div className="relative">
          <Button
            variant="tool"
            size="icon-sm"
            title="Task options"
            aria-label={`Options for ${task.title}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical className="size-[18px]" aria-hidden="true" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  onToggle(task.id)
                  setMenuOpen(false)
                }}
                className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
              >
                {done ? 'Reopen task' : 'Mark as done'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onAction(task)
                  setMenuOpen(false)
                }}
                className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
              >
                {task.action.label}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(task.id)
                  setMenuOpen(false)
                }}
                className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-error transition-colors hover:bg-error-container/40"
              >
                Delete task
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
})

type GroupProps = {
  title: string
  dot: string
  count: number
  actionLabel: string
  children: React.ReactNode
}

export function TaskGroup({ title, dot, count, actionLabel, children }: GroupProps) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-2.5 rounded-full', dot)} aria-hidden="true" />
          <h2 className="font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          <Badge tone="card" className="bg-surface-card text-text-secondary shadow-sm">
            {count} Tasks
          </Badge>
        </div>
        <span className="font-label-sm text-label-sm text-secondary">{actionLabel}</span>
      </div>
      {children}
    </section>
  )
}
