import type { LucideIcon } from 'lucide-react'
import { CardShell, CardHeader, CardBadge } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type StatsCardProps = {
  title: string
  value: string
  hint?: string
  icon: LucideIcon
  badge?: string
  className?: string
}

/**
 * Kartu statistik kecil untuk dashboard.
 */
export function StatsCard({ title, value, hint, icon: Icon, badge, className }: StatsCardProps) {
  return (
    <CardShell className={cn('min-h-0 gap-3 p-5', className)}>
      <CardHeader className="mb-0 min-h-0">
        <span className="flex size-9 items-center justify-center rounded-xl bg-surface-container">
          <Icon className="size-4.5 text-secondary" aria-hidden="true" />
        </span>
        {badge && <CardBadge>{badge}</CardBadge>}
      </CardHeader>
      <div>
        <p className="font-label-md text-label-md text-text-secondary">{title}</p>
        <p className="mt-1 font-headline-lg text-headline-lg-mobile font-semibold tracking-tight text-text-primary">
          {value}
        </p>
        {hint && <p className="mt-1 font-body-sm text-body-sm text-text-secondary">{hint}</p>}
      </div>
    </CardShell>
  )
}
