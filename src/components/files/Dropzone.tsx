import { useRef, useState } from 'react'
import { CloudUpload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

type Props = {
  onFiles: (files: File[]) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

export function Dropzone({ onFiles, inputRef }: Props) {
  const [dragging, setDragging] = useState(false)
  const dragCount = useRef(0)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files: drag and drop or press Enter to browse"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        dragCount.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        dragCount.current = Math.max(0, dragCount.current - 1)
        if (dragCount.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragCount.current = 0
        setDragging(false)
        if (e.dataTransfer.files.length > 0) onFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-surface-card p-6 text-center shadow-sm transition-all hover:shadow-md focus-visible:outline-2 focus-visible:outline-secondary',
        dragging && 'bg-surface-container-low ring-2 ring-secondary/40',
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-container-low text-secondary transition-transform group-hover:scale-110">
        <CloudUpload className="size-8" aria-hidden="true" />
      </div>
      <div className="flex max-w-lg flex-col gap-1">
        <span className="font-headline-sm text-headline-sm font-semibold text-text-primary">
          Drag &amp; drop files here to prepare them for study search
        </span>
        <p className="font-body-sm text-body-sm text-text-secondary">
          Supported formats: PDF, DOCX, CSV, JSON, TXT, XLSX (Max 500MB per file). Documents are
          automatically processed for instant study search.
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {['Key-concept extraction', 'Automatic indexing', 'AES-256 Encryption'].map((c) => (
          <Badge key={c} tone="neutral" className="bg-canvas-background">
            {c}
          </Badge>
        ))}
      </div>
    </div>
  )
}
