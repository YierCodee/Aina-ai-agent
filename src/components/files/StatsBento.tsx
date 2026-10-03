import { CheckCircle2, Cpu, HardDrive, RefreshCw, FileText, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { MaterialStats } from '@/lib/coursesApi'

type Props = {
  /**
   * Statistik dari `GET /api/materials`. `null` = backend belum menjawab.
   *
   * Tidak ada angka default yang fabricated: sebelum backend siap, tampilkan
   * skeleton, bukan "128 Files" yang terlihat meyakinkan. `0` adalah nilai
   * yang sah (database kosong), jadi tidak boleh jadi placeholder.
   */
  stats: MaterialStats | null
  /** Jumlah folder/pinned collections, dari `GET /api/folders`. */
  collections: number
}

/** Kuota workspace. Konstanta konfigurasi, bukan data — boleh hardcode. */
const QUOTA_GB = 50

function formatSnippets(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k Snippets` : `${n} Snippets`
}

function formatStorage(sizeMB: number): { value: string; sub: string; progress: number } {
  const quotaMB = QUOTA_GB * 1024
  const progress = quotaMB > 0 ? Math.min(100, (sizeMB / quotaMB) * 100) : 0
  if (sizeMB >= 1024) {
    const gb = sizeMB / 1024
    return {
      value: `${gb.toFixed(1)} GB`,
      sub: `of ${QUOTA_GB} GB (${progress.toFixed(1)}%)`,
      progress,
    }
  }
  const mb = Math.max(0, Math.round(sizeMB))
  return {
    value: `${mb} MB`,
    sub: `of ${QUOTA_GB} GB (${progress.toFixed(1)}%)`,
    progress,
  }
}

const skeletonCard =
  'flex min-h-[118px] flex-col justify-between rounded-xl bg-surface-card p-4 shadow-sm'

export function StatsBento({ stats, collections }: Props) {
  if (!stats) {
    return (
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="File statistics"
        aria-busy="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={skeletonCard} aria-hidden="true">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />
            <div className="flex flex-col gap-2">
              <div className="h-7 w-1/2 animate-pulse rounded bg-surface-container" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const storage = formatStorage(stats.totalSizeMB)

  const cards = [
    {
      id: 'total',
      label: 'Total Course Files',
      value: `${stats.total} Files`,
      meta: stats.indexing > 0 ? `${stats.indexing} indexing…` : 'Synced with Course Materials',
      icon: FileText,
      metaClass: 'text-success-emerald',
      metaIcon: TrendingUp,
      dark: false,
    },
    {
      id: 'embeddings',
      label: 'Study Snippets Indexed',
      value: formatSnippets(stats.totalChunks),
      meta: `${stats.indexed} ready`,
      icon: Cpu,
      metaClass: 'text-secondary',
      metaIcon: RefreshCw,
      dark: false,
    },
    {
      id: 'storage',
      label: 'Storage Used',
      value: storage.value,
      sub: storage.sub,
      icon: HardDrive,
      dark: false,
      progress: storage.progress,
    },
    {
      id: 'kb',
      label: 'Active Course Collections',
      value: `${collections} Connected`,
      meta: stats.indexing > 0 ? `${stats.indexing} indexing…` : 'All synced',
      icon: CheckCircle2,
      dark: true,
    },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="File statistics">
      {cards.map((c) => {
        const Icon = c.icon
        if (c.dark) {
          return (
            <div
              key={c.id}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-dark p-4 text-on-primary shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-label-md text-label-md text-slate-300">{c.label}</span>
                <Badge className="bg-secondary text-on-primary text-[10px] uppercase tracking-wider">
                  High Sync
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-headline-md text-headline-md font-bold tracking-tight text-white">
                  {c.value}
                </span>
                <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-slate-300">
                  <CheckCircle2 className="size-[14px] text-success-emerald" aria-hidden="true" />
                  <span>{'meta' in c ? c.meta : ''}</span>
                </div>
              </div>
            </div>
          )
        }
        if ('progress' in c) {
          return (
            <div
              key={c.id}
              className="group flex flex-col justify-between rounded-xl bg-surface-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-label-md text-label-md text-text-secondary">{c.label}</span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-surface-container-low text-text-primary">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-headline-md text-headline-md font-bold tracking-tight text-text-primary">
                    {c.value}
                  </span>
                  <span className="font-label-sm text-label-sm text-text-secondary">{c.sub}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            </div>
          )
        }
        const metaClass = 'metaClass' in c ? c.metaClass : 'text-text-secondary'
        const MetaIcon = 'metaIcon' in c ? c.metaIcon : null
        return (
          <div
            key={c.id}
            className="group flex flex-col justify-between rounded-xl bg-surface-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-label-md text-label-md text-text-secondary">{c.label}</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-surface-container-low text-text-primary">
                <Icon className="size-[18px]" aria-hidden="true" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-text-primary">
                {c.value}
              </span>
              <div className={`flex items-center gap-1.5 font-label-sm text-label-sm ${metaClass}`}>
                {MetaIcon ? <MetaIcon className="size-[14px]" aria-hidden="true" /> : null}
                <span>{'meta' in c ? c.meta : ''}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
