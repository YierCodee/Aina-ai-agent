import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, FolderPlus, Plus, SlidersHorizontal } from 'lucide-react'
import type { TypeFilter } from '@/data/files'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'DOCX' },
  { id: 'csv', label: 'CSV' },
  { id: 'xlsx', label: 'XLSX' },
  { id: 'txt', label: 'TXT' },
]

type Props = {
  typeFilter: TypeFilter
  onTypeChange: (t: TypeFilter) => void
  onUpload: () => void
  onNewFolder: () => void
  /**
   * Jumlah materi siap (`stats.indexed` dari `GET /api/materials`).
   * `null` = backend belum menjawab → badge disembunyikan, bukan angka palsu.
   */
  readyCount: number | null
}

export function FilesHeader({ typeFilter, onTypeChange, onUpload, onNewFolder, readyCount }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeLabel = TYPE_OPTIONS.find((o) => o.id === typeFilter)?.label ?? 'All Types'

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open ])

  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1 font-label-md text-label-md text-text-secondary">
          <span className="cursor-pointer transition-colors hover:text-text-primary">Workspace</span>
          <ChevronRight className="size-[14px]" aria-hidden="true" />
          <span className="font-medium text-text-primary">Knowledge &amp; Files</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-headline-lg text-headline-lg font-semibold tracking-tight text-text-primary">
            Files Storage
          </h1>
          {readyCount !== null && (
            <Badge tone="card" className="bg-surface-card text-text-primary shadow-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-emerald opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success-emerald" />
              </span>
              <span>{readyCount} course materials ready</span>
            </Badge>
          )}
          <Badge tone="info">Study Multimodal</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
        <div className="relative" ref={menuRef}>
          <Button variant="ghost" size="md" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
            <SlidersHorizontal className="size-[18px] text-text-secondary" aria-hidden="true" />
            <span>{activeLabel}</span>
            <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
          </Button>
          {open && (
            <div
              role="listbox"
              aria-label="Filter by type"
              className="absolute left-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg"
            >
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === typeFilter}
                  onClick={() => {
                    onTypeChange(o.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-label-md text-label-md transition-colors hover:bg-surface-container-low',
                    o.id === typeFilter ? 'text-text-primary' : 'text-on-surface-variant',
                  )}
                >
                  <span>{o.label}</span>
                  {o.id === typeFilter && <Check className="size-4" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" size="md" onClick={onNewFolder}>
          <FolderPlus className="size-[18px] text-text-secondary" aria-hidden="true" />
          <span>New Folder</span>
        </Button>
        <Button variant="primary" size="md" onClick={onUpload}>
          <Plus className="size-[18px]" aria-hidden="true" />
          <span>Upload Files</span>
        </Button>
      </div>
    </div>
  )
}
