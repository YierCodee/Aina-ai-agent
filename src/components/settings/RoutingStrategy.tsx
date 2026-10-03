import { GitBranch, Zap, Database } from 'lucide-react'
import { ROUTING_STEPS } from '@/data/settings'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

const STEP_ICONS = [Zap, GitBranch, Database]

type Props = {
  activeRoute: string
  onSelectRoute: (id: string) => void
  disabledSteps: Record<string, boolean>
  onToggleStep: (id: string) => void
}

export function RoutingStrategy({ activeRoute, onSelectRoute, disabledSteps, onToggleStep }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {ROUTING_STEPS.map((step, idx) => {
          const Icon = STEP_ICONS[idx % STEP_ICONS.length]
          const active = activeRoute === step.id
          const disabled = !!disabledSteps[step.id]
          return (
            <div
              key={step.id}
              className={cn(
                'rounded-2xl border bg-surface-card p-5 shadow-sm transition-colors',
                active ? 'border-secondary' : 'border-border-subtle',
                disabled && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectRoute(step.id)}
                  aria-pressed={active}
                  className="flex min-w-0 items-start gap-3 text-left"
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl font-headline-sm text-headline-sm font-bold',
                      active ? 'bg-secondary text-white' : 'bg-surface-container text-text-secondary',
                    )}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 text-secondary" aria-hidden="true" />
                      <span className="font-headline-sm text-headline-sm font-semibold text-text-primary">
                        {step.title}
                      </span>
                    </span>
                    <span className="mt-1.5 block font-body-sm text-body-sm text-text-secondary">{step.desc}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={active ? 'brand' : 'neutral'}>{step.badge}</Badge>
                  <label className="flex cursor-pointer items-center gap-1.5 font-label-sm text-label-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={!disabled}
                      onChange={() => onToggleStep(step.id)}
                      aria-label={`Enable ${step.title}`}
                      className="size-4 accent-[#0058be]"
                    />
                    On
                  </label>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {step.meta.map((m) => (
                  <Badge key={m} tone="card" className="border border-border-subtle">
                    {m}
                  </Badge>
                ))}
              </div>
              {step.trigger && (
                <p className="mt-3 rounded-lg bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-text-secondary">
                  {step.trigger}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
