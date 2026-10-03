import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

/**
 * Header halaman generik (judul + deskripsi + aksi kanan).
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h1 className="font-headline-lg text-headline-lg-mobile font-semibold tracking-tight text-text-primary sm:text-headline-lg">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[720px] font-body-md text-body-md text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
