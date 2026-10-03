import { useState } from 'react'
import {
  ArrowRight,
  Cpu,
  Folder,
  FolderOpen,
  Lock,
  MoreVertical,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { FileFolder } from '@/data/files'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const FOLDER_ICONS = {
  folder: Folder,
  shared: FolderOpen,
  code: Cpu,
  lock: Lock,
} as const

function badgeTone(tone: FileFolder['badge']['tone']): 'info' | 'neutral' {
  switch (tone) {
    case 'rag':
    case 'vector':
      return 'info'
    case 'shared':
    case 'confidential':
    default:
      return 'neutral'
  }
}

type Props = {
  /** Dari backend. Jumlah & ukuran dihitung dari `course_materials`. */
  folders: FileFolder[]
  loading: boolean
  /** Klik kartu / "Open" membuka halaman isi folder. */
  onOpenFolder?: (folder: FileFolder) => void
  onRenameFolder?: (folder: FileFolder) => void
  onDeleteFolder?: (folder: FileFolder) => void
}

export function PinnedFolders({ folders, loading, onOpenFolder, onRenameFolder, onDeleteFolder }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-3" aria-label="Pinned folders">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-text-primary">
            Pinned Folders
          </h2>
          <Badge tone="neutral">{folders.length} Active</Badge>
        </div>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-0.5 font-label-md text-label-md text-secondary hover:underline"
        >
          <span>View directory</span>
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-busy={loading}
      >
        {folders.map((f) => {
          const Icon = FOLDER_ICONS[f.icon]
          const isOpen = openId === f.id
          return (
            <div
              key={f.id}
              role={onOpenFolder ? 'button' : undefined}
              tabIndex={onOpenFolder ? 0 : undefined}
              aria-label={onOpenFolder ? `Buka folder ${f.name}` : undefined}
              onClick={() => onOpenFolder?.(f)}
              onKeyDown={(e) => {
                if (onOpenFolder && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onOpenFolder(f)
                }
              }}
              className="group flex cursor-pointer flex-col justify-between gap-4 rounded-xl bg-surface-card p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-secondary transition-transform group-hover:scale-105">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <div className="relative">
                  <Button
                    variant="tool"
                    size="icon-sm"
                    title="Folder options"
                    aria-label={`Options for ${f.name}`}
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : f.id)}
                  >
                    <MoreVertical className="size-[18px]" aria-hidden="true" />
                  </Button>
                  {isOpen && (
                    <div
                      className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null)
                          onOpenFolder?.(f)
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null)
                          onRenameFolder?.(f)
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-text-primary transition-colors hover:bg-surface-container-low"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null)
                          onDeleteFolder?.(f)
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left font-label-md text-label-md text-error transition-colors hover:bg-error-container hover:text-on-error-container"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="truncate font-headline-sm text-headline-sm font-semibold text-text-primary transition-colors group-hover:text-secondary">
                  {f.name}
                </span>
                <div className="flex items-center gap-2 font-body-sm text-body-sm text-text-secondary">
                  <span>{f.count}</span>
                  <span aria-hidden="true">•</span>
                  <span>{f.size}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Badge tone={badgeTone(f.badge.tone)}>
                  {f.badge.tone === 'shared' ? (
                    <Users aria-hidden="true" />
                  ) : f.badge.tone === 'confidential' ? (
                    <ShieldCheck aria-hidden="true" />
                  ) : f.badge.tone === 'vector' ? (
                    <Cpu aria-hidden="true" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-secondary" aria-hidden="true" />
                  )}
                  {f.badge.label}
                </Badge>
                <span className="font-label-sm text-label-sm text-text-secondary">{f.updated}</span>
              </div>
            </div>
          )
        })}
        {folders.length === 0 && !loading && (
          <p className="rounded-xl bg-surface-card p-6 text-center font-body-sm text-body-sm text-text-secondary sm:col-span-2 lg:col-span-4">
            Belum ada folder tersimpan.
          </p>
        )}
      </div>
    </section>
  )
}
