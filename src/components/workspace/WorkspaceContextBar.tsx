import { FolderGit2, RefreshCw } from 'lucide-react'

type Props = {
  /**
   * Nama konteks aktif (mis. matkul materi terbaru). `null` = belum ada konteks.
   * `undefined` (default) = backend belum menjawab → placeholder berdenyut.
   */
  contextName?: string | null
  /**
   * Jumlah materi siap. `null`/`undefined` = belum tahu → placeholder,
   * bukan angka hardcode.
   */
  readyCount?: number | null
}

export function WorkspaceContextBar({ contextName, readyCount }: Props) {
  const loading = contextName === undefined || readyCount === undefined
  return (
    <div className="w-full flex items-center justify-between gap-3 p-3.5 bg-surface-card rounded-xl shadow-xs mb-6 max-w-3xl border border-border-subtle">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary shrink-0">
          <FolderGit2 className="text-[18px]" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-label-sm text-label-sm text-text-secondary uppercase tracking-wider font-semibold">
            Active Study Context
          </span>
          {loading ? (
            <span className="h-4 w-48 animate-pulse rounded bg-surface-container" aria-hidden="true" />
          ) : (
            <span className="font-body-sm text-body-sm text-text-primary font-medium truncate">
              {contextName ?? 'No active context'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {loading ? (
          <span className="h-5 w-32 animate-pulse rounded-full bg-surface-container" aria-hidden="true" />
        ) : (
          <span className="font-label-sm text-label-sm text-success-emerald px-2 py-0.5 rounded-full bg-success-emerald/10 font-medium hidden sm:inline-block">
            {readyCount} course materials ready
          </span>
        )}
        <button
          type="button"
          aria-label="Re-sync workspace index"
          className="w-7 h-7 rounded-full hover:bg-surface-container flex items-center justify-center text-text-secondary transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <RefreshCw className="text-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
