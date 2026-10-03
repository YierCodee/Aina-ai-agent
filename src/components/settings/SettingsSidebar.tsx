import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { KeyRound, MoreHorizontal, Search, Settings } from 'lucide-react'
import { SETTING_ANCHORS, type SettingSectionId } from '@/data/settings'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/hooks/useSidebarWidth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { SidebarTransition } from '@/components/feedback'

type Props = {
  open: boolean
  width: number
  dragging: boolean
  query: string
  onQueryChange: (q: string) => void
  activeSection: SettingSectionId
  onSelectSection: (id: SettingSectionId) => void
  connectedCount: number
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onClose: () => void
}

export function SettingsSidebar({
  open,
  width,
  dragging,
  query,
  onQueryChange,
  activeSection,
  onSelectSection,
  connectedCount,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onClose,
}: Props) {
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
          aria-label="API Router settings"
          className="flex h-full w-[var(--sbw-actual,280px)] flex-col"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Settings className="size-5 shrink-0 text-secondary" aria-hidden="true" />
                <span className="truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
                  API Router
                </span>
              </div>
              <Button variant="tool" size="icon-sm" aria-label="More options" className="shrink-0">
                <MoreHorizontal className="size-[18px]" aria-hidden="true" />
              </Button>
            </div>

            <Badge tone="card" className="w-fit shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
              <span className="size-2 shrink-0 rounded-full bg-success-emerald" aria-hidden="true" />
              {connectedCount} Providers Connected
            </Badge>

            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 size-[18px] text-on-surface-variant"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Filter provider..."
                type="text"
                aria-label="Filter provider"
                className="w-full rounded-lg bg-surface-container-lowest py-2 pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-[0_1px_4px_rgba(0,0,0,0.02)] placeholder:text-on-surface-variant focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              <span className="px-2 font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
                Configuration
              </span>
              <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
                {SETTING_ANCHORS.map((item, idx) => {
                  const active = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectSection(item.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                        active
                          ? 'bg-surface-container-high font-semibold text-on-surface'
                          : 'font-body-md text-body-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full font-label-sm text-label-sm font-semibold',
                          active ? 'bg-secondary text-white' : 'bg-surface-container text-text-secondary',
                        )}
                        aria-hidden="true"
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>

          <div className="p-3">
            <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 shrink-0 text-secondary" aria-hidden="true" />
                <span className="truncate font-label-md text-label-md font-medium text-on-surface">
                  Failover Daemon Ready
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-text-secondary">
                Heartbeat interval: 15s to router gateway
              </p>
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-success-emerald" aria-hidden="true" />
                <span className="font-label-sm text-label-sm text-success-emerald">Live</span>
              </div>
            </div>
          </div>

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