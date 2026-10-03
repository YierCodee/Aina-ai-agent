import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, FlaskConical, KeyRound, Loader2 } from 'lucide-react'
import type { ProviderItem, ProviderStatus, RouterPriority } from '@/data/settings'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

const STATUS_TONE: Record<ProviderStatus, 'success' | 'warning' | 'info'> = {
  active: 'success',
  ready: 'info',
  standby: 'warning',
}

const STATUS_LABEL: Record<ProviderStatus, string> = {
  active: 'Active',
  ready: 'Ready',
  standby: 'Standby',
}

const PRIORITIES: RouterPriority[] = [
  'Primary Reasoning',
  'Long-Context RAG',
  'Offline Fallback & Privacy',
  'Coding Backup',
]

type Props = {
  providers: ProviderItem[]
  testingId: string | null
  onTest: (id: string) => void
  onToggleStatus: (id: string) => void
  onPriorityChange: (id: string, priority: RouterPriority) => void
}

export function ProviderTable({ providers, testingId, onTest, onToggleStatus, onPriorityChange }: Props) {
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const copyEndpoint = async (id: string, endpoint: string) => {
    try {
      await navigator.clipboard.writeText(endpoint)
    } catch {
      // clipboard diblokir — tetap tampilkan feedback
    }
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600)
  }

  if (providers.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary">
        Tidak ada provider yang cocok dengan filter.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-sm">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              <th className="px-5 py-3">Provider &amp; Default Model</th>
              <th className="px-5 py-3">Endpoint URL &amp; Env</th>
              <th className="px-5 py-3">API Key Secret</th>
              <th className="px-5 py-3">Status &amp; Health</th>
              <th className="px-5 py-3">Usage &amp; Cost (MTD)</th>
              <th className="px-5 py-3">Router Priority</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => {
              const showKey = !!visibleKeys[p.id]
              const testing = testingId === p.id
              return (
                <tr key={p.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-container-low/60">
                  <td className="px-5 py-4">
                    <p className="font-headline-sm text-headline-sm font-semibold text-text-primary">
                      {p.name} <span className="font-body-sm text-body-sm font-normal text-text-secondary">{p.plan}</span>
                    </p>
                    <p className="mt-0.5 font-body-sm text-body-sm text-text-secondary">{p.models}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <code className="max-w-[220px] truncate rounded-md bg-surface-container-low px-2 py-1 font-body-sm text-body-sm text-on-surface">
                        {p.endpoint}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyEndpoint(p.id, p.endpoint)}
                        aria-label={`Copy endpoint ${p.name}`}
                        className="rounded-md p-1 text-text-secondary hover:bg-surface-container hover:text-on-surface"
                      >
                        {copied === p.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                      </button>
                    </div>
                    <p className="mt-1 font-body-sm text-body-sm text-text-secondary">{p.env}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <KeyRound className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                      <code className="font-body-sm text-body-sm text-on-surface">
                        {showKey ? p.keyMasked : p.keyMasked}
                      </code>
                      <button
                        type="button"
                        onClick={() => setVisibleKeys((v) => ({ ...v, [p.id]: !v[p.id] }))}
                        aria-label={showKey ? `Hide key ${p.name}` : `Show key ${p.name}`}
                        aria-pressed={showKey}
                        className="rounded-md p-1 text-text-secondary hover:bg-surface-container hover:text-on-surface"
                      >
                        {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={STATUS_TONE[p.status]}>
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          p.status === 'active' || p.status === 'ready' ? 'bg-success-emerald' : 'bg-amber-500',
                        )}
                        aria-hidden="true"
                      />
                      {STATUS_LABEL[p.status]}
                    </Badge>
                    <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
                      {p.ping} · {p.healthNote}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-body-md text-body-md font-medium text-on-surface">{p.tokensMTD}</p>
                    <p className="font-body-sm text-body-sm text-text-secondary">{p.costMTD}</p>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={p.priority}
                      onChange={(e) => onPriorityChange(p.id, e.target.value as RouterPriority)}
                      aria-label={`Router priority ${p.name}`}
                      className="max-w-[190px] rounded-lg border border-border-subtle bg-surface px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus-visible:outline-2 focus-visible:outline-secondary"
                    >
                      {PRIORITIES.map((pr) => (
                        <option key={pr} value={pr}>
                          {pr}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onTest(p.id)} disabled={testing}>
                        {testing ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                        <span>{testing ? 'Testing' : 'Test'}</span>
                      </Button>
                      <Button
                        variant={p.status === 'standby' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onToggleStatus(p.id)}
                        aria-pressed={p.status !== 'standby'}
                      >
                        {p.status === 'standby' ? 'Activate' : 'Pause'}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 p-4 lg:hidden">
        {providers.map((p) => {
          const showKey = !!visibleKeys[p.id]
          const testing = testingId === p.id
          return (
            <div key={p.id} className="rounded-xl border border-border-subtle bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-headline-sm text-headline-sm font-semibold text-text-primary">{p.name}</p>
                  <p className="font-body-sm text-body-sm text-text-secondary">
                    {p.plan} · {p.models}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </div>
              <code className="mt-3 block truncate rounded-md bg-surface-container-low px-2 py-1.5 font-body-sm text-body-sm">
                {p.endpoint}
              </code>
              <div className="mt-2 flex items-center gap-1.5 font-body-sm text-body-sm text-text-secondary">
                <KeyRound className="size-4" aria-hidden="true" />
                <span className="truncate">{showKey ? p.keyMasked : p.keyMasked}</span>
                <button
                  type="button"
                  onClick={() => setVisibleKeys((v) => ({ ...v, [p.id]: !v[p.id] }))}
                  aria-label={showKey ? `Hide key ${p.name}` : `Show key ${p.name}`}
                  className="rounded-md p-1 hover:bg-surface-container"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
                {p.ping} · {p.healthNote} · {p.tokensMTD} · {p.costMTD}
              </p>
              <select
                value={p.priority}
                onChange={(e) => onPriorityChange(p.id, e.target.value as RouterPriority)}
                aria-label={`Router priority ${p.name}`}
                className="mt-3 w-full rounded-lg border border-border-subtle bg-surface-card px-2 py-2 font-body-sm text-body-sm"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onTest(p.id)} disabled={testing} className="flex-1">
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                  <span>{testing ? 'Testing' : 'Test'}</span>
                </Button>
                <Button
                  variant={p.status === 'standby' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onToggleStatus(p.id)}
                  className="flex-1"
                >
                  {p.status === 'standby' ? 'Activate' : 'Pause'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
