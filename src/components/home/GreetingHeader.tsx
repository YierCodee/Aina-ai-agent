import orbitaLogo from '@/assets/orbita-logo.jpg'
import { QUICK_ACTIONS } from '@/data/nav'
import { Button } from '@/components/ui/button'

type GreetingHeaderProps = {
  subtitle?: string
}

export function GreetingHeader({ subtitle }: GreetingHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center mt-2 mb-8 select-none">
      <div className="relative group cursor-pointer mb-5">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-secondary/30 blur-xl group-hover:blur-2xl transition-all duration-500 scale-95 group-hover:scale-110"
        />
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-b from-surface-card to-surface-container-highest flex items-center justify-center shadow-lg transition-transform duration-500 hover:-translate-y-1">
          <img
            alt="Orbita Glowing Core 3D Sphere"
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_8px_20px_rgba(0,88,190,0.35)]"
            src={orbitaLogo}
          />
        </div>
      </div>

      <h1 className="font-headline-xl text-headline-xl-mobile sm:text-headline-xl text-text-primary tracking-tight font-bold flex items-center justify-center gap-2">
        <span>Hi, there</span>
        <span className="inline-block hover:rotate-12 transition-transform duration-300">
          👋
        </span>
      </h1>

      <p className="font-body-lg text-body-lg text-text-secondary mt-2 max-w-md tracking-normal">
        {subtitle ?? "Tell us what you need, and we'll handle the rest."}
      </p>
    </div>
  )
}

type QuickActionsProps = {
  onAction: (label: string) => void
}

export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mb-8">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction(action.label)}
            className="h-9 px-4 whitespace-nowrap border border-border-subtle"
          >
            <Icon
              aria-hidden="true"
              className={
                action.spin
                  ? 'size-4 shrink-0 text-secondary animate-spin [animation-duration:2.5s]'
                  : 'size-4 shrink-0 text-secondary'
              }
            />
            <span className="truncate">{action.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
