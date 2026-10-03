import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Props = {
  /** Label konteks aktif, mis. nama paket matkul. `null` = belum ada konteks. */
  contextLabel?: string | null
  /** Jumlah materi yang siap. Turunan dari `GET /api/materials`. */
  readyCount?: number
}

export function ContextStatusBar({ contextLabel = null, readyCount = 0 }: Props) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 rounded-xl bg-surface-card p-4 font-label-md text-label-md text-text-secondary shadow-sm sm:flex-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-2 rounded-full bg-secondary" aria-hidden="true" />
        <span className="font-medium text-text-primary">Active Workspace Context:</span>
        <span className="max-w-xs truncate text-text-primary">
          {contextLabel ?? 'No active context'}
        </span>
        <Badge tone="info">{contextLabel ? 'Study Synced' : 'Empty'}</Badge>
      </div>
      <div className="flex items-center gap-2 font-body-sm text-body-sm">
        <span>{readyCount} course materials ready</span>
        <span aria-hidden="true">•</span>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-1 text-secondary hover:underline"
        >
          <span>Campus Privacy Policy</span>
          <Lock className="size-[14px]" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
