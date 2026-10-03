import { FolderPlus, Menu, Share2, Upload } from 'lucide-react'
import type { FilesTab } from '@/data/files'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

const TABS: { id: FilesTab; label: string }[] = [
  { id: 'all', label: 'All Files' },
  { id: 'recent', label: 'Recent' },
  { id: 'shared', label: 'Shared' },
  { id: 'trash', label: 'Trash' },
]

type Props = {
  tab: FilesTab
  onTabChange: (t: FilesTab) => void
  onToggleSidebar: () => void
  onUpload: () => void
  onNewFolder: () => void
}

export function FilesTopbar({ tab, onTabChange, onToggleSidebar, onUpload, onNewFolder }: Props) {
  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-border-subtle bg-surface-card/90 backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="tool"
            size="icon-sm"
            className="shrink-0 md:hidden"
            aria-label="Toggle documents sidebar"
            onClick={onToggleSidebar}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <nav className="flex items-center gap-4" aria-label="Files sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'transition-colors',
                  tab === t.id
                    ? 'font-headline-sm text-headline-sm font-semibold text-text-primary'
                    : 'font-body-md text-body-md text-on-surface-variant hover:text-on-surface',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="md" onClick={onNewFolder} className="hidden sm:inline-flex">
            <FolderPlus className="size-[18px]" aria-hidden="true" />
            <span>New Folder</span>
          </Button>
          <Button variant="ghost" size="md" className="hidden sm:inline-flex" aria-label="Share (segera hadir)" disabled>
            <Share2 className="size-[18px]" aria-hidden="true" />
            <span>Share</span>
          </Button>
          <Button variant="primary" size="md" onClick={onUpload}>
            <Upload className="size-[18px]" aria-hidden="true" />
            <span>Upload</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
