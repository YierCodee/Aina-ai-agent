import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UpgradeCard() {
  return (
    <div className="border-t border-border-subtle bg-surface-card p-3">
      <Button
        variant="soft"
        size="sm"
        className="h-10 w-full justify-between px-4"
        aria-label="Upgrade to Pro (segera hadir)"
        title="Upgrade to Pro — segera hadir"
        disabled
      >
        <span className="flex min-w-0 items-center gap-2">
          <Rocket className="size-4 shrink-0 text-secondary" aria-hidden="true" />
          <span className="truncate">Upgrade to Pro</span>
        </span>
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 font-label-sm text-label-sm text-on-secondary">
          NEW
        </span>
      </Button>
    </div>
  )
}
