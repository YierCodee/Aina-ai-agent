import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { groupThreadsByDate, visibleThreads } from '@/data/threadGroups'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/hooks/useSidebarWidth'
import type { ChatThread } from '@/hooks/useChat'
import { SidebarGroup } from './SidebarGroup'
import { UpgradeCard } from './UpgradeCard'
import { Search, Plus, PanelLeftClose, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarTransition } from '@/components/feedback'

type ChatSidebarProps = {
  open: boolean
  /** Seluruh thread yang ada; thread kosong disaring di dalam komponen ini. */
  threads: ChatThread[]
  activeThreadId: string | null
  width: number
  dragging: boolean
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onNewChat: () => void
  onSelectThread: (id: string) => void
  onDeleteThread?: (id: string) => void
  onClearHistory?: () => void
  /** True selama daftar sesi diambil dari backend. */
  isLoadingHistory?: boolean
  onClose: () => void
}

/** Chat history sidebar — lebar bisa di-drag, jadi drawer di mobile. */
export function ChatSidebar({
  open,
  threads,
  activeThreadId,
  width,
  dragging,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  onClearHistory,
  isLoadingHistory,
  onClose,
}: ChatSidebarProps) {
  const groups = groupThreadsByDate(visibleThreads(threads))
  const hasHistory = groups.length > 0
  const onHandleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 50 : 10
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onResizeNudge(-step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
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
        className="group/sidebar fixed left-[var(--rail-w)] top-0 z-40 flex h-full flex-col border-r border-border-subtle bg-surface-card"
      >
        <aside
          aria-label="Chat history"
          className="flex h-full w-[var(--sbw-actual,280px)] flex-col"
        >
          <div className="flex h-16 min-w-0 items-center justify-between px-4">
            <span className="truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
              Chat
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full px-0 text-on-surface-variant"
              aria-label="Search chat threads (segera hadir)"
              title="Search — segera hadir"
              disabled
            >
              <Search className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="px-3 pb-2">
            <Button variant="primary" size="sm" onClick={onNewChat} className="h-10 w-full" aria-label="Start a new chat">
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">New Chat</span>
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
            {isLoadingHistory ? (
              <p className="px-2 py-1 font-body-sm text-body-sm text-text-secondary" aria-live="polite">
                Memuat riwayat…
              </p>
            ) : groups.length === 0 ? (
              <p className="px-2 py-1 font-body-sm text-body-sm text-text-secondary">
                Belum ada percakapan. Kirim pesan untuk memulai.
              </p>
            ) : (
              groups.map((group) => (
                <SidebarGroup
                  key={group.id}
                  label={group.label}
                  threads={group.threads}
                  activeThreadId={activeThreadId}
                  onSelect={onSelectThread}
                  onDelete={onDeleteThread}
                />
              ))
            )}
          </div>

          {hasHistory && onClearHistory && (
            <div className="px-3 pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      'Hapus seluruh riwayat chat? Tindakan ini tidak bisa dibatalkan.',
                    )
                  ) {
                    onClearHistory()
                  }
                }}
                className="h-9 w-full text-text-secondary hover:text-error"
                aria-label="Hapus seluruh riwayat chat"
              >
                <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Hapus semua riwayat</span>
              </Button>
            </div>
          )}

          <UpgradeCard />

          {/* Tombol hide — chevron melayang di tepi kanan, desktop saja */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            tabIndex={open ? 0 : -1}
            className="absolute right-2 top-16 hidden size-6 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-on-surface-variant opacity-0 shadow-sm transition-opacity hover:bg-surface-container hover:text-on-surface focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary group-hover/sidebar:opacity-100 md:flex"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>

          {/* Drag handle — tepi kanan, desktop saja */}
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
            className={`absolute right-0 top-0 hidden h-full w-3 cursor-col-resize touch-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:block ${
              dragging ? 'bg-secondary' : 'bg-transparent hover:bg-secondary/40'
            }`}
          />
        </aside>
      </SidebarTransition>
    </>
  )
}
