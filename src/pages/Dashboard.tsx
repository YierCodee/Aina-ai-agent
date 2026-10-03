import { Activity, Server, Zap } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { useSidecarStatus } from '@/hooks/useSidecarStatus'

/**
 * Halaman Dashboard — contoh pemakaian DashboardLayout + StatsCard
 * + status FastAPI sidecar.
 */
export function Dashboard() {
  const { status, loading, refresh } = useSidecarStatus(10_000)

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <PageHeader
          title="Dashboard"
          description="Ringkasan status aplikasi dan FastAPI sidecar."
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={status?.running ? 'success' : 'warning'}>
                <span
                  className={`size-2 rounded-full ${status?.running ? 'bg-success-emerald' : 'bg-outline'}`}
                  aria-hidden="true"
                />
                {loading ? 'Mengecek…' : status?.running ? 'Sidecar Online' : 'Sidecar Offline'}
              </Badge>
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-xl border border-border-subtle bg-surface-card px-3 py-1.5 font-label-md text-label-md text-text-primary shadow-sm hover:bg-surface-container-low"
              >
                Refresh
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatsCard
            title="Sidecar URL"
            value={status?.url ?? '—'}
            hint={status?.detail ?? 'Belum ada data.'}
            icon={Server}
            badge="FastAPI"
          />
          <StatsCard
            title="Status"
            value={loading ? '…' : status?.running ? 'Online' : 'Offline'}
            hint="Polling /health tiap 10 dtk."
            icon={Activity}
            badge="Health"
          />
          <StatsCard
            title="Tauri Bridge"
            value="invoke()"
            hint="src/lib/tauri.ts → commands.rs"
            icon={Zap}
            badge="Rust"
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Dashboard
