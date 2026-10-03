import { ShieldCheck } from 'lucide-react'
import type { ThresholdState } from '@/data/settings'
import { SettingsToggle } from './SettingsToggle'

type Props = {
  value: ThresholdState
  onChange: (next: ThresholdState) => void
}

export function ThresholdControls({ value, onChange }: Props) {
  const set = (patch: Partial<ThresholdState>) => onChange({ ...value, ...patch })

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="max-latency" className="font-label-lg text-label-lg font-medium text-text-primary">
              Max Latency Threshold
            </label>
            <span className="rounded-full bg-surface-container px-2.5 py-0.5 font-label-md text-label-md font-semibold text-secondary tabular-nums">
              {value.maxLatencyMs} ms
            </span>
          </div>
          <input
            id="max-latency"
            type="range"
            min={1000}
            max={6000}
            step={100}
            value={value.maxLatencyMs}
            onChange={(e) => set({ maxLatencyMs: Number(e.target.value) })}
            className="mt-3 w-full accent-[#0058be]"
            aria-valuetext={`${value.maxLatencyMs} milliseconds`}
          />
          <div className="mt-1 flex justify-between font-label-sm text-label-sm text-text-secondary">
            <span>Fast (1000ms)</span>
            <span>Relaxed (6000ms)</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="font-label-lg text-label-lg font-medium text-text-primary">Auto Retry Attempts</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ retryAttempts: Math.max(1, value.retryAttempts - 1) })}
                disabled={value.retryAttempts <= 1}
                aria-label="Decrease retry attempts"
                className="flex size-7 items-center justify-center rounded-full border border-border-subtle font-bold disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-16 text-center font-label-md text-label-md font-semibold tabular-nums">
                {value.retryAttempts}x Retry
              </span>
              <button
                type="button"
                onClick={() => set({ retryAttempts: Math.min(5, value.retryAttempts + 1) })}
                disabled={value.retryAttempts >= 5}
                aria-label="Increase retry attempts"
                className="flex size-7 items-center justify-center rounded-full border border-border-subtle font-bold disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          <p className="mt-3 font-body-sm text-body-sm text-text-secondary">1 Attempt — 5 Attempts Max</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 border-t border-border-subtle pt-5 lg:grid-cols-2">
        <SettingsToggle
          id="offline-auto-switch"
          label="Offline Auto-Switch"
          description="Aktifkan model offline jika WAN putus"
          checked={value.offlineAutoSwitch}
          onChange={(next) => set({ offlineAutoSwitch: next })}
        />
        <SettingsToggle
          id="semantic-caching"
          label="Silent Semantic Caching"
          description="Simpan vector embeddings jawaban"
          checked={value.semanticCaching}
          onChange={(next) => set({ semanticCaching: next })}
        />
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-3">
        <ShieldCheck className="size-5 shrink-0 text-success-emerald" aria-hidden="true" />
        <p className="font-body-sm text-body-sm text-text-secondary">
          <span className="font-semibold text-on-surface">Failover Daemon Ready</span> — Heartbeat interval: 15s to
          router gateway
        </p>
      </div>
    </div>
  )
}
