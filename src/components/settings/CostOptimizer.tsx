import { PiggyBank, Wifi, BellRing } from 'lucide-react'
import {
  CAMPUS_SUBNET,
  CURRENT_DAILY_SPEND_USD,
  type CostOptimizerState,
} from '@/data/settings'
import { SettingsToggle } from './SettingsToggle'
import { cn } from '@/utils/cn'

type Props = {
  value: CostOptimizerState
  onChange: (next: CostOptimizerState) => void
}

export function CostOptimizer({ value, onChange }: Props) {
  const set = (patch: Partial<CostOptimizerState>) => onChange({ ...value, ...patch })
  const overBudget = CURRENT_DAILY_SPEND_USD > value.dailyBudgetUsd
  const spendPct = Math.min(100, Math.round((CURRENT_DAILY_SPEND_USD / Math.max(value.dailyBudgetUsd, 0.01)) * 100))

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface-container">
          <PiggyBank className="size-5 text-secondary" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-headline-sm text-headline-sm font-semibold text-text-primary">Cost Optimizer Settings</h3>
          <p className="font-body-sm text-body-sm text-success-emerald">Hemat s.d 42%</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-xl border border-border-subtle p-4">
          <SettingsToggle
            id="auto-downgrade"
            label="Auto-downgrade to mini/flash"
            description="Gunakan model hemat untuk sapaan sederhana, instruksi pendek (<20 token), dan formatting markdown."
            checked={value.autoDowngrade}
            onChange={(next) => set({ autoDowngrade: next })}
          />
          <p className="mt-2 font-body-sm text-body-sm text-text-secondary">
            Estimasi penghematan: ~42% anggaran bulanan
          </p>
        </div>

        <div className="rounded-xl border border-border-subtle p-4">
          <SettingsToggle
            id="force-ollama"
            label="Force Ollama on Campus Wi-Fi / LAN"
            description="Jika client terdeteksi pada IP subnet kampus (10.200.x.x), prioritaskan kluster server GPU lokal tanpa kuota internet."
            checked={value.forceOllamaOnCampus}
            onChange={(next) => set({ forceOllamaOnCampus: next })}
          />
          <p className="mt-2 flex items-center gap-1.5 font-body-sm text-body-sm text-text-secondary">
            <Wifi className="size-4" aria-hidden="true" /> Subnet: {CAMPUS_SUBNET}
          </p>
        </div>

        <div className="rounded-xl border border-border-subtle p-4">
          <SettingsToggle
            id="budget-alert"
            label="Daily Budget Alert Threshold"
            description="Kirim notifikasi ke Telegram admin & email dosen lab jika pengeluaran harian melebihi ambang batas."
            checked={value.budgetAlert}
            onChange={(next) => set({ budgetAlert: next })}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label htmlFor="daily-budget" className="flex items-center gap-1.5 font-body-sm text-body-sm text-text-secondary">
              <BellRing className="size-4" aria-hidden="true" />$ / hari
            </label>
            <input
              id="daily-budget"
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={value.dailyBudgetUsd}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) set({ dailyBudgetUsd: Math.min(100, Math.max(0.5, n)) })
              }}
              disabled={!value.budgetAlert}
              className="w-24 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 font-body-md text-body-md tabular-nums disabled:opacity-50"
            />
            <span className={cn('font-label-md text-label-md tabular-nums', overBudget ? 'text-error' : 'text-text-secondary')}>
              Saat ini: ${CURRENT_DAILY_SPEND_USD.toFixed(2)}
              {overBudget ? ' — over budget!' : ''}
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-container"
            role="progressbar"
            aria-valuenow={spendPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Daily spend versus budget"
          >
            <div
              className={cn('h-full rounded-full', overBudget ? 'bg-error' : 'bg-success-emerald')}
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
