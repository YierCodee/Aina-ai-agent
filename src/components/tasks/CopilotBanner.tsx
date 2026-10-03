import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Props = {
  onOptimize: () => void
  onSettings: () => void
}

export function CopilotBanner({ onOptimize, onSettings }: Props) {
  return (
    <section
      className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-surface-dark p-6 text-on-primary shadow-[0_8px_24px_rgba(15,23,42,0.12)] md:flex-row md:items-center"
      aria-label="Orbita co-pilot"
    >
      <div className="z-10 flex max-w-xl flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="brand">Orbita Co-pilot Active</Badge>
          <span className="font-label-sm text-label-sm text-inverse-primary">
            Background Execution Engine
          </span>
        </div>
        <h3 className="font-headline-md text-headline-md font-semibold tracking-tight text-on-primary">
          Let Orbita organize your assignments automatically
        </h3>
        <p className="font-body-md text-body-md text-inverse-primary">
          Orbita can read LMS discussions, connect class schedules, and schedule the
          high-impact tasks straight to your exam week.
        </p>
      </div>
      <div className="z-10 flex items-center gap-3">
        <Button
          size="md"
          onClick={onOptimize}
          className="bg-surface-card px-5 py-2.5 font-label-lg text-label-lg text-text-primary shadow hover:bg-surface-container"
        >
          Optimize Schedule
        </Button>
        <button
          type="button"
          onClick={onSettings}
          className="rounded-full bg-surface-container-high/20 px-4 py-2.5 font-label-lg text-label-lg text-on-primary transition-all hover:bg-surface-container-high/30"
        >
          Settings
        </button>
      </div>
    </section>
  )
}
