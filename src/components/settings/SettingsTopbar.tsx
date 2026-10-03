import { Menu, Save, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Props = {
  onToggleSidebar: () => void
  onTestAll: () => void
  onSave: () => void
  testing: boolean
}

export function SettingsTopbar({ onToggleSidebar, onTestAll, onSave, testing }: Props) {
  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-border-subtle bg-surface/85 backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="tool"
            size="icon-sm"
            className="shrink-0 md:hidden"
            aria-label="Toggle settings sidebar"
            onClick={onToggleSidebar}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 items-center gap-2 font-label-md text-label-md text-text-secondary">
            <span className="hidden sm:inline">Workspace</span>
            <span aria-hidden="true" className="hidden sm:inline">/</span>
            <span className="hidden sm:inline">Backend Infrastructure</span>
            <span aria-hidden="true" className="hidden sm:inline">/</span>
            <span className="truncate font-semibold text-on-surface">API &amp; Smart Router</span>
          </div>
          <span className="hidden h-4 w-px bg-surface-container-high lg:block" aria-hidden="true" />
          <Badge tone="card" className="hidden shadow-[0_1px_4px_rgba(0,0,0,0.03)] lg:inline-flex">
            <span className="size-2 rounded-full bg-success-emerald" aria-hidden="true" />
            Smart Router: High-Availability
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="md" onClick={onTestAll} disabled={testing} className="hidden sm:inline-flex">
            <FlaskConical className="size-4" aria-hidden="true" />
            <span>{testing ? 'Testing…' : 'Test All'}</span>
          </Button>
          <Button variant="primary" size="md" onClick={onSave}>
            <Save className="size-4" aria-hidden="true" />
            <span>Save</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
