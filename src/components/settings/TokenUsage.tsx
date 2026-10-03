import { PieChart, Download } from 'lucide-react'
import { TOKEN_USAGE, TOTAL_MONTHLY_COST } from '@/data/settings'
import { Button } from '@/components/ui/button'

type Props = {
  onExport: () => void
}

export function TokenUsage({ onExport }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-container">
            <PieChart className="size-5 text-secondary" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-headline-sm text-headline-sm font-semibold text-text-primary">
              Academic Token Usage &amp; Cost Breakdown
            </h3>
            <p className="font-body-sm text-body-sm text-text-secondary">Semester Genap 2024/2025</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onExport}>
          <Download className="size-4" aria-hidden="true" />
          <span>Export CSV</span>
        </Button>
      </div>

      <p className="mt-3 font-body-sm text-body-sm text-text-secondary">
        Distribusi real-time konsumsi token AI per mata kuliah komputasi dan modul riset mahasiswa.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        {TOKEN_USAGE.map((u) => (
          <div key={u.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-body-md text-body-md font-medium text-on-surface">{u.course}</p>
              <p className="font-label-md text-label-md font-semibold tabular-nums">
                {u.cost} <span className="font-normal text-text-secondary">({u.pct}%)</span>
              </p>
            </div>
            <div
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-container"
              role="progressbar"
              aria-valuenow={u.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${u.course} ${u.pct} percent`}
            >
              <div className="h-full rounded-full bg-secondary-container" style={{ width: `${u.pct}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-1 font-body-sm text-body-sm text-text-secondary">
              <span>{u.note}</span>
              <span className="tabular-nums">{u.tokens}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-low px-4 py-3">
        <p className="font-body-md text-body-md text-text-secondary">
          Total Akumulasi Biaya Bulan Ini: <span className="font-bold text-on-surface">{TOTAL_MONTHLY_COST}</span>
        </p>
        <p className="font-body-sm text-body-sm text-text-secondary">
          Didanai oleh: Hibah Laboratorium Sistem Cerdas &amp; AI Mahasiswa
        </p>
      </div>
    </div>
  )
}
