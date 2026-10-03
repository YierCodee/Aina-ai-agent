import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { KeyRound, Waypoints, SlidersHorizontal, PieChart, PiggyBank, CheckCircle2 } from 'lucide-react'
import {
  DEFAULT_OPTIMIZER,
  DEFAULT_THRESHOLDS,
  INITIAL_PROVIDERS,
  TOKEN_USAGE,
  loadPersistedSettings,
  persistSettings,
  type CostOptimizerState,
  type ProviderStatus,
  type RouterPriority,
  type SettingSectionId,
  type ThresholdState,
} from '@/data/settings'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { SettingsTopbar } from '@/components/settings/SettingsTopbar'
import { FixedLayer } from '@/components/feedback/FixedLayer'
import { ProviderTable } from '@/components/settings/ProviderTable'
import { RoutingStrategy } from '@/components/settings/RoutingStrategy'
import { ThresholdControls } from '@/components/settings/ThresholdControls'
import { TokenUsage } from '@/components/settings/TokenUsage'
import { CostOptimizer } from '@/components/settings/CostOptimizer'
import { Badge } from '@/components/ui/badge'

type Props = {
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarDragging: boolean
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onToggleSidebar: () => void
  onCloseSidebar: () => void
}

function SectionHeader({
  id,
  icon: Icon,
  title,
  desc,
  badge,
}: {
  id: SettingSectionId
  icon: typeof KeyRound
  title: string
  desc: string
  badge?: string
}) {
  return (
    <div id={`settings-${id}`} className="scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-card shadow-sm">
            <Icon className="size-5 text-secondary" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-headline-md text-headline-md font-semibold tracking-tight text-text-primary">{title}</h2>
            <p className="mt-0.5 max-w-[720px] font-body-md text-body-md text-text-secondary">{desc}</p>
          </div>
        </div>
        {badge && <Badge tone="card" className="border border-border-subtle">{badge}</Badge>}
      </div>
    </div>
  )
}

export function SettingsPage({
  sidebarOpen,
  sidebarWidth,
  sidebarDragging,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onToggleSidebar,
  onCloseSidebar,
}: Props) {
  const [providers, setProviders] = useState(() => {
    const saved = loadPersistedSettings()
    if (saved.providerStatus) {
      return INITIAL_PROVIDERS.map((p) =>
        saved.providerStatus?.[p.id] ? { ...p, status: saved.providerStatus[p.id] } : p,
      )
    }
    return INITIAL_PROVIDERS
  })
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [activeSection, setActiveSection] = useState<SettingSectionId>('providers')
  const [activeRoute, setActiveRoute] = useState('primary')
  const [disabledSteps, setDisabledSteps] = useState<Record<string, boolean>>({})
  const [thresholds, setThresholds] = useState<ThresholdState>(() => ({
    ...DEFAULT_THRESHOLDS,
    ...loadPersistedSettings().thresholds,
  }))
  const [optimizer, setOptimizer] = useState<CostOptimizerState>(() => ({
    ...DEFAULT_OPTIMIZER,
    ...loadPersistedSettings().optimizer,
  }))
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testingAll, setTestingAll] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const testTimer = useRef<number | null>(null)

  // Cleanup timer saat unmount
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      if (testTimer.current) window.clearTimeout(testTimer.current)
    }
  }, [])

  const flash = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const filteredProviders = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    if (!q) return providers
    return providers.filter((p) =>
      `${p.name} ${p.plan} ${p.models} ${p.endpoint}`.toLowerCase().includes(q),
    )
  }, [providers, sidebarQuery])

  const connectedCount = useMemo(
    () => providers.filter((p) => p.status !== 'standby').length,
    [providers],
  )

  const selectSection = (id: SettingSectionId) => {
    setActiveSection(id)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (window.innerWidth < 768) onCloseSidebar()
  }

  const testProvider = (id: string) => {
    if (testingId) return
    setTestingId(id)
    if (testTimer.current) window.clearTimeout(testTimer.current)
    testTimer.current = window.setTimeout(() => {
      setTestingId(null)
      const name = providers.find((p) => p.id === id)?.name ?? 'Provider'
      flash(`${name} merespons normal — ping OK, 0 error.`)
    }, 900)
  }

  const testAll = () => {
    if (testingAll) return
    setTestingAll(true)
    window.setTimeout(() => {
      setTestingAll(false)
      flash(`${connectedCount} provider diuji — semua endpoint merespons.`)
    }, 1200)
  }

  const toggleStatus = (id: string) => {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const next: ProviderStatus = p.status === 'standby' ? 'active' : 'standby'
        flash(next === 'standby' ? `${p.name} dipause ke Standby.` : `${p.name} diaktifkan.`)
        return { ...p, status: next }
      }),
    )
  }

  const changePriority = (id: string, priority: RouterPriority) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, priority } : p)))
    flash(`Router priority diperbarui ke ${priority}.`)
  }

  const saveAll = () => {
    const providerStatus = Object.fromEntries(providers.map((p) => [p.id, p.status])) as Record<string, ProviderStatus>
    persistSettings({ thresholds, optimizer, providerStatus })
    flash('Semua konfigurasi tersinkronisasi.')
  }

  const exportCsv = () => {
    const rows = ['Course,Cost,Pct,Note,Tokens', ...TOKEN_USAGE.map((u) => `"${u.course}",${u.cost},${u.pct},"${u.note}",${u.tokens}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'orbita-token-usage.csv'
    a.click()
    URL.revokeObjectURL(url)
    flash('Token usage diekspor ke CSV.')
  }

  return (
    <>
      <FixedLayer>
        <SettingsSidebar
          open={sidebarOpen}
          width={sidebarWidth}
          dragging={sidebarDragging}
          query={sidebarQuery}
          onQueryChange={setSidebarQuery}
          activeSection={activeSection}
          onSelectSection={selectSection}
          connectedCount={connectedCount}
          onResizeStart={onResizeStart}
          onResizeNudge={onResizeNudge}
          onResizeReset={onResizeReset}
          onClose={onCloseSidebar}
        />
      </FixedLayer>

      <SettingsTopbar
        onToggleSidebar={onToggleSidebar}
        onTestAll={testAll}
        onSave={saveAll}
        testing={testingAll}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 pb-24 sm:px-6">
        {/* Page intro — cerminan header Stitch */}
        <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Workspace</Badge>
            <span className="font-label-md text-label-md text-text-secondary">Backend Infrastructure</span>
            <Badge tone="success">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {connectedCount} Providers Connected
            </Badge>
          </div>
          <h1 className="mt-3 font-headline-lg text-headline-lg-mobile font-semibold tracking-tight text-text-primary sm:text-headline-lg">
            API &amp; Smart Router Configuration
          </h1>
          <p className="mt-1.5 max-w-[760px] font-body-md text-body-md text-text-secondary">
            Kelola konfigurasi model LLM, pantau batas kuota &amp; pengeluaran biaya token akademik, serta atur
            strategi failover otomatis jika koneksi terputus.
          </p>
        </div>

        <section aria-labelledby="settings-providers-heading" className="flex flex-col gap-4">
          <SectionHeader
            id="providers"
            icon={KeyRound}
            title="Provider API Keys"
            desc="Kunci API terenkripsi AES-256 untuk pemanggilan model komersial dan endpoint lokal terpadu."
            badge="AES-256 Encrypted"
          />
          <ProviderTable
            providers={filteredProviders}
            testingId={testingId}
            onTest={testProvider}
            onToggleStatus={toggleStatus}
            onPriorityChange={changePriority}
          />
        </section>

        <section aria-labelledby="settings-routing-heading" className="flex flex-col gap-4">
          <SectionHeader
            id="routing"
            icon={Waypoints}
            title="Smart Fallback & Routing Strategy"
            desc="Dynamic Cascade v2 — diagram orkestrasi otomatis bila terjadi latensi tinggi atau pembatasan kuota token."
            badge="Dynamic Cascade v2"
          />
          <RoutingStrategy
            activeRoute={activeRoute}
            onSelectRoute={(id) => {
              setActiveRoute(id)
              setActiveSection('routing')
            }}
            disabledSteps={disabledSteps}
            onToggleStep={(id) => {
              setDisabledSteps((d) => ({ ...d, [id]: !d[id] }))
              flash(disabledSteps[id] ? 'Tahap routing diaktifkan.' : 'Tahap routing dinonaktifkan.')
            }}
          />
        </section>

        <section aria-labelledby="settings-thresholds-heading" className="flex flex-col gap-4">
          <SectionHeader
            id="thresholds"
            icon={SlidersHorizontal}
            title="Router Threshold Controls"
            desc="Sesuaikan ambang batas toleransi jaringan dan mekanisme percobaan ulang (retry)."
          />
          <ThresholdControls value={thresholds} onChange={setThresholds} />
        </section>

        <section aria-labelledby="settings-usage-heading" className="flex flex-col gap-4">
          <SectionHeader
            id="usage"
            icon={PieChart}
            title="Academic Token Usage & Cost"
            desc="Semester Genap 2024/2025 — konsumsi real-time per mata kuliah."
            badge="Real-time"
          />
          <TokenUsage onExport={exportCsv} />
        </section>

        <section aria-labelledby="settings-optimizer-heading" className="flex flex-col gap-4">
          <SectionHeader
            id="optimizer"
            icon={PiggyBank}
            title="Cost Optimizer"
            desc="Aturan pintar untuk menekan pengeluaran token komersial secara otomatis."
            badge="Hemat s.d 42%"
          />
          <CostOptimizer value={optimizer} onChange={setOptimizer} />
        </section>

        {toast && (
          <FixedLayer>
            <div
              role="status"
              className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-text-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-lg"
            >
              {toast}
            </div>
          </FixedLayer>
        )}
      </div>
    </>
  )
}
