import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-semibold select-none [&_svg]:size-[14px] [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        primary: 'bg-primary text-on-primary',
        brand: 'bg-surface-container text-secondary',
        danger: 'bg-error-container text-error',
        info: 'bg-surface-container-low text-text-secondary',
        violet: 'bg-surface-container-low text-text-secondary',
        neutral: 'bg-surface-container-low text-text-secondary',
        card: 'bg-surface-container-lowest text-text-secondary',
        success: 'bg-surface-container-low text-text-secondary',
        warning: 'bg-surface-container-low text-text-secondary',
        highlight: 'bg-surface-container-low text-text-secondary',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, children, ...props }, ref) => {
    return (
      <span className={cn(badgeVariants({ tone, className }))} ref={ref} {...props}>
        {children}
      </span>
    )
  },
)
Badge.displayName = 'Badge'

export { Badge }
