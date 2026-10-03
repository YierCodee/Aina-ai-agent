import { Badge } from '@/components/ui/badge'
import { useSidecarStatus } from '@/hooks/useSidecarStatus'
import { cn } from '@/utils/cn'

type SidecarBadgeProps = {
  /** Default 30 dtk agar tidak noisy saat sidecar offline. 0 = cek sekali saja. */
  pollIntervalMs?: number
  className?: string
}

/**
 * Indikator status FastAPI sidecar yang kompak untuk Topbar.
 * Satu-satunya pemanggil `useSidecarStatus` di jalur chat agar tidak ada polling ganda.
 */
export function SidecarBadge({ pollIntervalMs = 30_000, className }: SidecarBadgeProps) {
  const { status, loading, error, refresh } = useSidecarStatus(pollIntervalMs)
  const running = status?.running ?? false
  const label =
    loading && !status ? 'Mengecek…' : running ? 'Sidecar Online' : 'Sidecar Offline'
  const tooltip = `${status?.url ?? 'http://127.0.0.1:8471'} — ${status?.detail ?? error ?? 'Belum ada data.'} Klik untuk refresh.`

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      title={tooltip}
      aria-label={`${label}. Klik untuk refresh status sidecar`}
      className={cn(
        'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-secondary/60',
        className,
      )}
    >
      <Badge tone={running ? 'success' : 'warning'}>
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            running ? 'bg-success-emerald' : 'bg-outline',
            loading && 'animate-pulse',
          )}
        />
        <span className="hidden min-[480px]:inline">{label}</span>
        <span className="sr-only sm:hidden">{label}</span>
      </Badge>
    </button>
  )
}
