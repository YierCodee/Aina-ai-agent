import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useMemo } from 'react'
import {
  Archive,
  BookOpen,
  Brain,
  Database,
  FileText,
  FolderOpen,
  Mic,
  MoreHorizontal,
  Pin,
  Search,
  Upload,
} from 'lucide-react'
import { QUICK_ACCESS, STORAGE_DRIVE } from '@/data/files'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/hooks/useSidebarWidth'
import { Button } from '@/components/ui/button'
import { SidebarTransition } from '@/components/feedback'

const QUICK_ICONS = [Pin, BookOpen, FileText] as const
const DRIVE_ICONS = [FolderOpen, Brain, Mic, Database, Archive] as const

type Props = {
  open: boolean
  width: number
  dragging: boolean
  query: string
  onQueryChange: (q: string) => void
  onUpload: () => void
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onClose: () => void
  /**
   * false = database kosong. Section berisi label statis (Quick Access,
   * Storage Drive, Workspace Storage) disembunyikan supaya halaman terlihat
   * benar-benar nol — label seperti "Algorithms Pack 2025" itu data palsu
   * kalau tidak ada satu berkas pun.
   */
  hasData: boolean
  /**
   * Total ukuran materi (MB) dari `GET /api/materials`. Dipakai kartu
   * Workspace Storage. `null` = belum terjawab → skeleton.
   */
  storageMB: number | null
}

export function DocumentsSidebar({
  open,
  width,
  dragging,
  query,
  onQueryChange,
  onUpload,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onClose,
  hasData,
  storageMB,
}: Props) {
  const quotaMB = 50 * 1024
  const usedPct = storageMB === null ? 0 : Math.min(100, (storageMB / quotaMB) * 100)
  const usedLabel =
    storageMB === null
      ? ''
      : storageMB >= 1024
        ? `${(storageMB / 1024).toFixed(1)} GB of 50 GB`
        : `${Math.max(0, Math.round(storageMB))} MB of 50 GB`
  const q = query.trim().toLowerCase()
  const quick = useMemo(
    () => QUICK_ACCESS.filter((i) => i.label.toLowerCase().includes(q)),
    [q],
  )
  const drive = useMemo(
    () => STORAGE_DRIVE.filter((i) => i.label.toLowerCase().includes(q)),
    [q],
  )

  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 50 : 10
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onResizeNudge(-step)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onResizeNudge(step)
    }
  }

  return (
    <>
      <SidebarTransition
        open={open}
        width={width}
        dragging={dragging}
        onClose={onClose}
        className="fixed left-[var(--rail-w)] top-0 z-40 flex h-full flex-col bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
      >
        <aside
          aria-label="Documents"
          className="flex h-full w-[var(--sbw-actual,280px)] flex-col"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
                Documents
              </span>
              <Button variant="tool" size="icon-sm" aria-label="More options">
                <MoreHorizontal className="size-[18px] shrink-0" aria-hidden="true" />
              </Button>
            </div>
            <div className="relative flex items-center">
              <Search
                className="absolute left-3 size-[18px] text-on-surface-variant"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search documents..."
                type="text"
                aria-label="Search documents"
                className="w-full rounded-xl bg-canvas-background py-2 pl-9 pr-3 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary focus:bg-surface-container-low focus:outline-none"
              />
            </div>
            <Button variant="primary" size="md" onClick={onUpload} className="h-10 w-full">
              <Upload className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">Upload Document</span>
            </Button>
          </div>

          {hasData && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Quick Access
              </span>
              <nav className="flex flex-col gap-0.5" aria-label="Quick access">
                {quick.map((item, idx) => {
                  const Icon = QUICK_ICONS[idx % QUICK_ICONS.length]
                  return (
                    <a
                      key={item.id}
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 font-body-sm text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </a>
                  )
                })}
                {quick.length === 0 && (
                  <p className="px-2 py-1 text-body-sm text-text-secondary">No matches.</p>
                )}
              </nav>
            </div>

            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Storage Drive
              </span>
              <nav className="flex flex-col gap-0.5" aria-label="Storage drive">
                {drive.map((item, idx) => {
                  const Icon = DRIVE_ICONS[idx % DRIVE_ICONS.length]
                  return (
                    <a
                      key={item.id}
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 font-body-sm text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </a>
                  )
                })}
                {drive.length === 0 && (
                  <p className="px-2 py-1 text-body-sm text-text-secondary">No matches.</p>
                )}
              </nav>
            </div>
          </div>
          )}

          {hasData && (
          <div className="p-3">
            <div className="flex flex-col gap-2 rounded-xl bg-canvas-background p-3">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-text-primary">
                  Workspace Storage
                </span>
                {storageMB === null ? (
                  <span className="h-3 w-10 animate-pulse rounded bg-surface-container" aria-hidden="true" />
                ) : (
                  <span className="font-label-sm text-label-sm text-text-secondary">
                    {usedPct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-valuenow={Math.round(usedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Workspace storage usage"
              >
                <div className="h-1.5 rounded-full bg-secondary" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="flex items-center justify-between pt-1">
                {storageMB === null ? (
                  <span className="h-4 w-32 animate-pulse rounded bg-surface-container" aria-hidden="true" />
                ) : (
                  <span className="font-body-sm text-body-sm text-text-secondary">
                    {usedLabel}
                  </span>
                )}
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="font-label-md text-label-md text-secondary hover:underline"
                >
                  Upgrade
                </a>
              </div>
            </div>
          </div>
          )}

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={Math.round(width)}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            tabIndex={open ? 0 : -1}
            onPointerDown={onResizeStart}
            onDoubleClick={onResizeReset}
            onKeyDown={onHandleKeyDown}
            className={`absolute right-0 top-0 hidden h-full w-3 cursor-col-resize touch-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-secondary md:block ${
              dragging ? 'bg-secondary' : 'bg-transparent hover:bg-secondary/40'
            }`}
          />
        </aside>
      </SidebarTransition>
    </>
  )
}