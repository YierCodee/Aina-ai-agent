import type { ChatThread } from '@/hooks/useChat'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

type SidebarGroupProps = {
  /** Judul grup, mis. `Today`. */
  label: string
  threads: ChatThread[]
  activeThreadId: string | null
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}

export function SidebarGroup({ label, threads, activeThreadId, onSelect, onDelete }: SidebarGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex h-7 items-center gap-1.5 px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <div className="relative flex flex-col gap-1">
        {threads.map((thread) => (
          <ChatThreadRow
            key={thread.id}
            thread={thread}
            active={thread.id === activeThreadId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

type ChatThreadRowProps = {
  thread: ChatThread
  active: boolean
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}

function ChatThreadRow({ thread, active, onSelect, onDelete }: ChatThreadRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(thread.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(thread.id)
        }
      }}
      aria-current={active ? true : undefined}
      className={cn(
        'group w-full h-9 flex items-center gap-1 rounded-lg px-2 text-left font-body-sm text-body-sm text-text-secondary transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary cursor-pointer',
        active && 'bg-surface-container text-on-surface font-medium',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(thread.id)
          }}
          aria-label={`Hapus percakapan "${thread.title}"`}
          title="Hapus percakapan"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary opacity-0 transition-opacity hover:bg-surface-container-high hover:text-on-surface focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100',
            // Selalu terlihat di thread aktif & perangkat sentuh (tanpa hover).
            active && 'opacity-100',
            '[@media(hover:none)]:opacity-100',
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}