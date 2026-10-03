import { TASKS } from '@/data/cards'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardShell, CardHeader, CardBadge, CardFooter } from '@/components/ui/card'

export function TasksCard() {
  return (
    <CardShell variant="light" aria-labelledby="tasks-list-title">
      <div>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-success-emerald animate-pulse motion-reduce:animate-none" />
            <h3
              id="tasks-list-title"
              className="font-headline-sm text-headline-sm text-text-primary tracking-tight"
            >
              Tasks List
            </h3>
          </div>
          <CardBadge variant="light">3 active</CardBadge>
        </CardHeader>

        <ul className="flex flex-col gap-2">
          {TASKS.map((task) => {
            const Icon = task.icon
            return (
              <li key={task.label}>
                <button
                  type="button"
                  title={task.label}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-surface-container-low transition-colors flex items-center gap-3 group/item cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                >
                  <span className="size-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-secondary">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="font-body-sm text-body-sm text-text-primary group-hover/item:text-secondary truncate transition-colors">
                    {task.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <CardFooter>
        <Button
          variant="ghost"
          size="sm"
          className="p-0 shadow-none font-label-md text-label-md text-secondary hover:text-on-secondary-fixed-variant font-semibold group/link"
        >
          <span>View All</span>
          <ArrowRight
            size={16}
            className="group-hover/link:translate-x-0.5 transition-transform"
            aria-hidden="true"
          />
        </Button>
      </CardFooter>
    </CardShell>
  )
}
