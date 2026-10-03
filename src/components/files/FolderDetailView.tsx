import { ChevronRight, Cpu, Folder as FolderIcon, FolderOpen, Lock, Pencil, Trash2, Upload } from 'lucide-react'
import type { FileDoc, FileFolder, FilesSort, FilesView } from '@/data/files'
import { FilesTable } from '@/components/files/FilesTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const FOLDER_ICONS = {
  folder: FolderIcon,
  shared: FolderOpen,
  code: Cpu,
  lock: Lock,
} as const

type Props = {
  /** Folder yang sedang dibuka. Count/size/updated sudah agregat server. */
  folder: FileFolder
  onBack: () => void
  /** Upload langsung ke folder ini (memicu input tersembunyi FilesPage). */
  onUploadInto: () => void
  onRenameFolder: (folder: FileFolder) => void
  onDeleteFolder: (folder: FileFolder) => void
  // Terusan ke FilesTable — satu sumber data dari FilesPage.
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
  folders: FileFolder[]
  onMove: (ids: string[], folderId: string | null) => void
  moving: boolean
  onRenameFile: (f: FileDoc) => void
  onDeleteFiles: (ids: string[]) => void
  deleting: boolean
}

export function FolderDetailView({
  folder,
  onBack,
  onUploadInto,
  onRenameFolder,
  onDeleteFolder,
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
  onRenameFile,
  onDeleteFiles,
  deleting,
}: Props) {
  const Icon = FOLDER_ICONS[folder.icon]
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-1 font-label-md text-label-md text-text-secondary" aria-label="Breadcrumb">
        <button
          type="button"
          onClick={onBack}
          className="transition-colors hover:text-text-primary"
        >
          Files
        </button>
        <ChevronRight className="size-[14px]" aria-hidden="true" />
        <span className="font-medium text-text-primary" aria-current="page">
          {folder.name}
        </span>
      </nav>

      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-surface-card p-6 shadow-sm sm:flex-row sm:items-center" aria-label={`Folder ${folder.name}`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-secondary">
            <Icon className="size-7" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate font-headline-md text-headline-md font-semibold tracking-tight text-text-primary">
              {folder.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 font-body-sm text-body-sm text-text-secondary">
              <span>{folder.count}</span>
              <span aria-hidden="true">•</span>
              <span>{folder.size}</span>
              {folder.updated && (
                <>
                  <span aria-hidden="true">•</span>
                  <span>{folder.updated}</span>
                </>
              )}
              <Badge tone="neutral">{folder.badge.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="md" onClick={() => onRenameFolder(folder)}>
            <Pencil className="size-4" aria-hidden="true" />
            <span>Rename</span>
          </Button>
          <Button variant="ghost" size="md" onClick={() => onDeleteFolder(folder)} className="text-error hover:bg-error-container hover:text-on-error-container">
            <Trash2 className="size-4" aria-hidden="true" />
            <span>Hapus</span>
          </Button>
          <Button variant="outline" size="md" onClick={onBack}>
            <span>Kembali</span>
          </Button>
          <Button variant="primary" size="md" onClick={onUploadInto}>
            <Upload className="size-4" aria-hidden="true" />
            <span>Upload ke folder ini</span>
          </Button>
        </div>
      </section>

      <FilesTable
        files={files}
        total={total}
        page={page}
        pageCount={pageCount}
        query={query}
        sort={sort}
        view={view}
        selectedIds={selectedIds}
        allSelected={allSelected}
        onQueryChange={onQueryChange}
        onSortCycle={onSortCycle}
        onViewChange={onViewChange}
        onPageChange={onPageChange}
        onToggleSelect={onToggleSelect}
        onToggleAll={onToggleAll}
        onAsk={onAsk}
        sortLabel={sortLabel}
        folders={folders}
        onMove={onMove}
        moving={moving}
        onRenameFile={onRenameFile}
        onDeleteFiles={onDeleteFiles}
        deleting={deleting}
      />
    </div>
  )
}
