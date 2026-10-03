import { cn } from '@/utils/cn'

type Props = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  id?: string
}

export function SettingsToggle({ checked, onChange, label, description, id }: Props) {
  const toggleId = id ?? `toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-label-lg text-label-lg font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-0.5 font-body-sm text-body-sm text-text-secondary">{description}</p>
        )}
      </div>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
          checked ? 'bg-secondary' : 'bg-surface-container-highest',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}
