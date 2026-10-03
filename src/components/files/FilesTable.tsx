import { memo, useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Bot,
  ChartLine,
  FileSpreadsheet,
  FileText,
  FolderInput,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  SquareTerminal,
  Table2,
  Trash2,
} from 'lucide-react'
import type { FileDoc, FileFolder, FilesSort, FilesView } from '@/data/files'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { toneClass } from '@/utils/tone'

function KindIcon({ kind }: { kind: FileDoc['kind'] }) {
  if (kind === 'csv')
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <Table2 className="size-5" aria-hidden="true" />
      </div>
    )
  if (kind === 'xlsx')
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <FileSpreadsheet className="size-5" aria-hidden="true" />
      </div>
    )
  if (kind === 'pdf')
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <FileText className="size-5" aria-hidden="true" />
      </div>
    )
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
      <FileText className="size-5" aria-hidden="true" />
    </div>
  )
}

function StatusBadge({ file }: { file: FileDoc }) {
  if (file.status === 'indexing')
    return (
      <Badge tone="warning">
        <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
        Indexed ({file.progress ?? 98}%)
      </Badge>
    )
  if (file.status === 'ready')
    return (
      <Badge tone="success">
        <SquareTerminal aria-hidden="true" />
        Code Interpreter Ready
      </Badge>
    )
  if (file.status === 'indexed')
    return (
      <Badge tone="info">
        <span className="size-2 rounded-full bg-secondary" aria-hidden="true" />
        Indexed
      </Badge>
    )
  return (
    <Badge tone="info">
      <span className="size-2 rounded-full bg-secondary" aria-hidden="true" />
      Study Ready
    </Badge>
  )
}

type RowProps = {
  file: FileDoc
  selected: boolean
  onToggle: (id: string) => void
  onAsk: (f: FileDoc) => void
  folders: FileFolder[]
  onMove: (ids: string[], folderId: string | null) => void
  moving: boolean
  onRename: (f: FileDoc) => void
  onDelete: (f: FileDoc) => void
  deleting: boolean
}

const FileRow = memo(function FileRow({ file, selected, onToggle, onAsk, folders, onMove, moving, onRename, onDelete, deleting }: RowProps) {
  const isData = file.kind === 'csv' || file.kind === 'xlsx'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  return (
    <tr className="group transition-colors hover:bg-surface-container-low/60">
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(file.id)}
          aria-label={`Select ${file.name}`}
          className="size-4 cursor-pointer rounded accent-secondary"
        />
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-3">
          <KindIcon kind={file.kind} />
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => onAsk(file)}
              className="truncate text-left font-headline-sm text-headline-sm font-semibold text-text-primary transition-colors group-hover:text-secondary"
            >
              {file.name}
            </button>
            <span className="text-xs text-text-secondary">{file.sub}</span>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-3">
        <StatusBadge file={file} />
      </td>
      <td className="whitespace-nowrap px-2 py-3 font-medium text-text-primary">{file.sizeLabel}</td>
      <td className="whitespace-nowrap px-2 py-3 text-text-secondary">{file.modified}</td>
      <td className="whitespace-nowrap px-2 py-3">
        <Badge tone="neutral" className="bg-canvas-background text-text-primary">
          <span
            className={cn(
              'flex size-[14px] items-center justify-center rounded-full text-[10px] font-bold text-white',
              toneClass(file.assistant.tone),
            )}
            aria-hidden="true"
          >
            {file.assistant.initial}
          </span>
          <span className="font-medium">{file.assistant.name}</span>
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onAsk(file)}
            title={isData ? 'Analyze with AI' : 'Chat with this file'}
            className="inline-flex items-center gap-1 rounded-full bg-text-primary px-3 py-1 font-label-sm text-label-sm text-on-primary shadow-sm transition-transform hover:bg-surface-dark active:scale-95"
          >
            {isData ? (
              <ChartLine className="size-[14px]" aria-hidden="true" />
            ) : (
              <Bot className="size-[14px]" aria-hidden="true" />
            )}
            <span>{isData ? 'Analyze' : 'Ask AI'}</span>
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              title="File options"
              aria-label={`Options for ${file.name}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={moving}
              className="rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              <MoreHorizontal className="size-[18px]" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={`Options for ${file.name}`}
                className="absolute bottom-full right-0 z-30 mb-1 max-h-56 w-52 overflow-y-auto rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg"
              >
                <p className="px-3 pb-1 pt-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                  Pindah ke folder
                </p>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="menuitem"
                    disabled={moving}
                    onClick={() => {
                      setMenuOpen(false)
                      onMove([file.id], f.id)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50"
                  >
                    <FolderInput className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  disabled={moving}
                  onClick={() => {
                    setMenuOpen(false)
                    onMove([file.id], null)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50"
                >
                  <FolderInput className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">Keluarkan (file lepas)</span>
                </button>
                <div className="mx-2 my-1 h-px bg-border-subtle" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onRename(file)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
                >
                  <Pencil className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">Ganti nama</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleting}
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(file)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label-md text-label-md text-error transition-colors hover:bg-error-container hover:text-on-error-container disabled:opacity-50"
                >
                  <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Hapus permanen</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
})

type Props = {
  files: FileDoc[]
  total: number
  page: number
  pageCount: number
  query: string
  sort: FilesSort
  view: FilesView
  selectedIds: Set<string>
  allSelected: boolean
  onQueryChange: (q: string) => void
  onSortCycle: () => void
  onViewChange: (v: FilesView) => void
  onPageChange: (p: number) => void
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onAsk: (f: FileDoc) => void
  sortLabel: string
  /** Daftar folder untuk aksi pindah. Kosong = menu hanya berisi "keluarkan". */
  folders: FileFolder[]
  onMove: (ids: string[], folderId: string | null) => void
  moving: boolean
  /** Sembunyikan footer pagination (untuk daftar ringkas "File Terbaru"). */
  hidePagination?: boolean
  onRenameFile: (f: FileDoc) => void
  onDeleteFiles: (ids: string[]) => void
  deleting: boolean
}

export function FilesTable({
  files,
  total,
  page,
  pageCount,
  query,
  sort,
  view,
  selectedIds,
  allSelected,
  onQueryChange,
  onSortCycle,
  onViewChange,
  onPageChange,
  onToggleSelect,
  onToggleAll,
  onAsk,
  sortLabel,
  folders,
  onMove,
  moving,
  hidePagination = false,
  onRenameFile,
  onDeleteFiles,
  deleting,
}: Props) {
  const [bulkTarget, setBulkTarget] = useState('')
  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-surface-card shadow-sm" aria-label="All documents">
      <div className="flex flex-col justify-between gap-3 bg-surface-card p-4 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-2.5 size-[18px] text-text-secondary" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search files, tags, or course contents..."
            type="text"
            aria-label="Search files"
            className="w-full rounded-xl bg-canvas-background py-2 pl-9 pr-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary focus:bg-surface-container-low focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center rounded-xl bg-canvas-background p-1" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => onViewChange('list')}
              title="List View"
              aria-pressed={view === 'list'}
              className={cn(
                'rounded-lg p-1.5 transition-all',
                view === 'list' ? 'bg-surface-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <List className="size-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onViewChange('grid')}
              title="Grid View"
              aria-pressed={view === 'grid'}
              className={cn(
                'rounded-lg p-1.5 transition-all',
                view === 'grid' ? 'bg-surface-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <LayoutGrid className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
          <div className="mx-1 h-6 w-px bg-surface-container" aria-hidden="true" />
          <button
            type="button"
            onClick={onSortCycle}
            className="flex items-center gap-1 rounded-xl bg-canvas-background px-3 py-1.5 font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
          >
            <span>Sort: {sortLabel}</span>
            <ArrowUpDown className="size-4 text-text-secondary" aria-hidden="true" />
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-body-sm text-body-sm text-text-secondary">
            <thead>
              <tr className="select-none bg-canvas-background font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                <th className="w-12 px-4 py-3 text-center" scope="col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    aria-label="Select all files on this page"
                    className="size-4 cursor-pointer rounded accent-secondary"
                  />
                </th>
                <th className="px-2 py-3 font-semibold" scope="col">Name</th>
                <th className="px-2 py-3 font-semibold" scope="col">Study Status</th>
                <th className="px-2 py-3 font-semibold" scope="col">Size</th>
                <th className="px-2 py-3 font-semibold" scope="col">Last Modified</th>
                <th className="px-2 py-3 font-semibold" scope="col">Assigned Assistant</th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  selected={selectedIds.has(f.id)}
                  onToggle={onToggleSelect}
                  onAsk={onAsk}
                  folders={folders}
                  onMove={onMove}
                  moving={moving}
                  onRename={onRenameFile}
                  onDelete={(doc) => onDeleteFiles([doc.id])}
                  deleting={deleting}
                />
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-secondary">
                    No documents match “{query}”. Try another keyword or type filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-card p-4">
              <div className="flex items-start justify-between">
                <KindIcon kind={f.kind} />
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => onToggleSelect(f.id)}
                  aria-label={`Select ${f.name}`}
                  className="size-4 cursor-pointer rounded accent-secondary"
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <button
                  type="button"
                  onClick={() => onAsk(f)}
                  className="truncate text-left font-headline-sm text-headline-sm font-semibold text-text-primary hover:text-secondary"
                >
                  {f.name}
                </button>
                <span className="text-xs text-text-secondary">{f.sub}</span>
              </div>
              <StatusBadge file={f} />
              <div className="flex items-center justify-between text-body-sm">
                <span className="font-medium text-text-primary">{f.sizeLabel}</span>
                <span className="text-text-secondary">{f.modified}</span>
              </div>
              <Button variant="primary" size="md" onClick={() => onAsk(f)} className="w-full">
                {f.kind === 'csv' || f.kind === 'xlsx' ? (
                  <ChartLine className="size-4" aria-hidden="true" />
                ) : (
                  <Bot className="size-4" aria-hidden="true" />
                )}
                <span>{f.kind === 'csv' || f.kind === 'xlsx' ? 'Analyze' : 'Ask AI'}</span>
              </Button>
            </div>
          ))}
          {files.length === 0 && (
            <p className="col-span-full py-10 text-center text-text-secondary">
              No documents match “{query}”.
            </p>
          )}
        </div>
      )}

      {!hidePagination && (
      <div className="flex flex-col items-center justify-between gap-2 bg-canvas-background p-4 font-label-md text-label-md text-text-secondary sm:flex-row">
        <div className="flex items-center gap-2">
          <span>
            Showing {files.length} of {total} documents
          </span>
          <span className="inline-block size-1 rounded-full bg-text-secondary" aria-hidden="true" />
          <span>Sorted by {sort}</span>
          {selectedIds.size > 0 && (
            <>
              <span className="inline-block size-1 rounded-full bg-text-secondary" aria-hidden="true" />
              <span>{selectedIds.size} selected</span>
              <span className="inline-block size-1 rounded-full bg-text-secondary" aria-hidden="true" />
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Pindahkan yang dipilih ke folder</span>
                <select
                  value={bulkTarget}
                  onChange={(e) => setBulkTarget(e.target.value)}
                  disabled={moving}
                  aria-label="Pindahkan yang dipilih ke folder"
                  className="max-w-44 truncate rounded-full bg-surface-card px-3 py-1.5 font-label-md text-label-md text-text-primary shadow-sm disabled:opacity-50"
                >
                  <option value="">Pindah ke…</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                  <option value="__none__">Keluarkan (file lepas)</option>
                </select>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={moving || !bulkTarget}
                  onClick={() => {
                    onMove(
                      Array.from(selectedIds),
                      bulkTarget === '__none__' ? null : bulkTarget,
                    )
                    setBulkTarget('')
                  }}
                >
                  {moving ? 'Memindah…' : 'Pindah'}
                </Button>
              </label>
              <Button
                variant="danger"
                size="sm"
                disabled={deleting || moving}
                onClick={() => onDeleteFiles(Array.from(selectedIds))}
              >
                {deleting ? 'Menghapus…' : `Hapus (${selectedIds.size})`}
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="md" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 transition-colors',
                p === page
                  ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                  : 'text-text-secondary hover:bg-surface-card hover:text-text-primary',
              )}
            >
              {p}
            </button>
          ))}
          <Button variant="ghost" size="md" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>
      )}
    </section>
  )
}
