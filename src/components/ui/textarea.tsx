import * as React from 'react'
import { cn } from '@/utils/cn'

type TextareaProps = React.ComponentPropsWithoutRef<'textarea'> & {
  variant?: 'default' | 'bare'
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <textarea
        className={cn(
          variant === 'bare'
            ? 'flex min-h-0 w-full border-0 bg-transparent px-2 py-1 font-body-md text-body-md text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
            : 'flex min-h-[80px] w-full rounded-xl border border-border-subtle bg-surface-card px-3 py-2 font-body-md text-body-md text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
