import { useState } from 'react'
import { MODEL_OPTIONS } from '@/data/nav'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type ModelSelectorProps = {
  model: string
  onSelect: (model: string) => void
}

export function ModelSelector({ model, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <Select value={model} onValueChange={onSelect} open={open} onOpenChange={setOpen}>
      <SelectTrigger
        aria-label="Pilih model"
        className="h-8 w-auto gap-1.5 rounded-full bg-surface-container-low px-2.5 py-0 text-text-primary hover:bg-surface-container sm:px-3 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-on-surface-variant [&>svg]:transition-transform [&[data-state=open]>svg]:rotate-180"
      >
        <span className="size-2 shrink-0 rounded-full bg-secondary" aria-hidden="true" />
        <span className="max-w-[72px] truncate sm:max-w-none">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={8} align="start" className="min-w-[180px]">
        {MODEL_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
