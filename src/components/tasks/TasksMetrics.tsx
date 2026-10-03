import { CalendarClock, CheckCircle2, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { TasksMetrics as TasksMetricsData } from '@/data/tasks'

const card =
  'flex flex-col justify-between rounded-2xl bg-surface-card p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-colors duration-200 hover:bg-surface-container-lowest'

type Props = {
  metrics: TasksMetricsData
}

export function TasksMetrics({ metrics }: Props) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Task metrics">
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Active Workload
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {metrics.activeWorkload}
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Tasks</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Badge tone="neutral">+{metrics.activeWorkloadCreatedToday}</Badge>
          <span className="font-body-sm text-body-sm text-text-secondary">created today</span>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Completed This Week
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {metrics.completedThisWeek}
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Tasks</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <TrendingUp className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Badge tone="neutral">
            <span className="size-1.5 rounded-full bg-success-emerald" aria-hidden="true" />
            On track
          </Badge>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Due Today
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {metrics.dueToday}
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Pending</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <CalendarClock className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Badge tone="danger">{metrics.dueTodayUrgent} Urgent</Badge>
          <span className="font-body-sm text-body-sm text-text-secondary">Needs review by 5 PM</span>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Semester Completion
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {metrics.semesterCompletion}%
              </span>
              <span className="inline-flex items-center gap-1 font-body-sm text-body-sm font-medium text-text-secondary">
                <TrendingUp className="size-4" aria-hidden="true" />
                +{metrics.completedThisWeek} this week
              </span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <TrendingUp className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="pt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
            <div className={`h-full w-[${metrics.semesterCompletion}%] rounded-full bg-secondary`} />
          </div>
          <div className="flex items-center justify-between pt-2.5">
            <span className="font-label-sm text-label-sm text-text-secondary">
              {metrics.semesterDone} of {metrics.semesterTotal} resolved
            </span>
            <span className="font-label-sm text-label-sm text-text-secondary">Target: 80%</span>
          </div>
        </div>
      </div>
    </section>
  )
}