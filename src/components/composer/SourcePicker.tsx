import { SOURCE_OPTIONS } from '@/data/nav'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type SourcePickerProps = {
  value: string
  onChange: (label: string) => void
}

export function SourcePicker({ value, onChange }: SourcePickerProps) {
  const active = SOURCE_OPTIONS.find((option) => option.label === value) ?? SOURCE_OPTIONS[0]

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Pilih sumber"
        className="h-8 w-auto gap-1.5 rounded-full bg-surface-container-low px-2.5 py-0 text-text-primary hover:bg-surface-container [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-on-surface-variant [&>svg]:transition-transform [&[data-state=open]>svg]:rotate-180"
      >
        <active.icon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
        <span className="max-w-[140px] truncate sm:max-w-none">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={8} align="start" className="min-w-[180px]">
        {SOURCE_OPTIONS.map((option) => {
          const OptionIcon = option.icon
          return (
            <SelectItem key={option.label} value={option.label}>
              <div className="flex items-center gap-2">
                <OptionIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
