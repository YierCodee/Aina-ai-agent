import * as React from 'react'
import { cn } from '@/utils/cn'

type CardShellProps = React.HTMLAttributes<HTMLElement> & {
  variant?: 'dark' | 'light'
}

const CardShell = React.forwardRef<HTMLElement, CardShellProps>(
  ({ variant = 'light', className, children, ...props }, ref) => {
    return (
      <article
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          'rounded-2xl p-6 h-full min-h-[248px] flex flex-col justify-between overflow-hidden group',
          'transition-all duration-200 ease-out hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none',
          variant === 'dark'
            ? 'relative bg-surface-dark text-on-primary border border-white/10 shadow-lg hover:shadow-xl'
            : 'bg-surface-card border border-border-subtle shadow-sm hover:shadow-md',
          className
        )}
        {...props}
      >
        {children}
      </article>
    )
  }
)
CardShell.displayName = 'CardShell'

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between mb-4 min-h-8', className)}
      {...props}
    />
  )
}

type CardBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'dark' | 'light'
}

function CardBadge({ variant = 'light', className, ...props }: CardBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium',
        variant === 'dark'
          ? 'bg-white/10 text-secondary-fixed uppercase tracking-wide font-semibold'
          : 'bg-surface-container text-text-secondary',
        className
      )}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-auto pt-4 flex items-center justify-between gap-3', className)}
      {...props}
    />
  )
}

export { CardShell, CardHeader, CardBadge, CardFooter }
