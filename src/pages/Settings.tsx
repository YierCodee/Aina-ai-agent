import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/shared/PageHeader'
import { useSidecarStatus } from '@/hooks/useSidecarStatus'
import { Badge } from '@/components/ui/badge'

/**
 * Halaman Settings versi struktur standar.
 *
 * Catatan: proyek ini juga punya `SettingsPage.tsx` (fitur penuh
 * Orbita: provider, router, dsb). File ini adalah entry ringan
 * sesuai susunan folder yang diminta — tampilkan status sidecar
 * + tautan ke pengaturan lanjutan bila diperlukan.
 */
export function Settings() {
  const { status, loading } = useSidecarStatus(10_000)

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <PageHeader
          title="Settings"
          description="Konfigurasi aplikasi dan koneksi backend."
          actions={
            <Badge tone={status?.running ? 'success' : 'warning'}>
              {loading ? 'Mengecek…' : status?.running ? 'Sidecar Online' : 'Sidecar Offline'}
            </Badge>
          }
        />

        <section className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-text-primary">
            Backend (FastAPI Sidecar)
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-2 font-body-md text-body-md sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">URL</dt>
              <dd className="font-mono text-text-primary">{status?.url ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Detail</dt>
              <dd className="text-text-primary">{status?.detail ?? 'Belum ada data.'}</dd>
            </div>
          </dl>
          <p className="mt-4 font-body-sm text-body-sm text-text-secondary">
            Untuk pengaturan provider/LLM yang lengkap, lihat{' '}
            <code className="font-mono">src/pages/SettingsPage.tsx</code>.
          </p>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default Settings
