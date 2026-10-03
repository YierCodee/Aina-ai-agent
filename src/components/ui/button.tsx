import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-full font-label-md text-label-md transition-all duration-200 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-container text-on-primary hover:bg-surface-dark shadow-sm',
        ghost:
          'bg-surface-card text-text-primary hover:bg-surface-container-low shadow-sm',
        soft: 'bg-surface-container-low text-text-primary hover:bg-surface-container',
        outline:
          'bg-transparent text-text-primary border border-border-subtle hover:bg-surface-container-low shadow-none',
        tool: 'bg-transparent text-text-secondary hover:bg-surface-container-low hover:text-text-primary shadow-none',
        // Aksi destruktif (hapus permanen, batalkan). Satu-satunya varian
        // merah solid. Warna dari pasangan token Material 3
        // `--color-error` / `--color-on-error`.
        // Hover pakai opacity, bukan `brightness-*`: repo ini tidak pernah pakai
        // brightness, dan tidak ada token "error lebih gelap" untuk ditukar.
        danger: 'bg-error text-on-error hover:opacity-90 shadow-sm',
      },
      size: {
        sm: 'h-8 px-3.5',
        md: 'px-4 py-1.5',
        icon: 'size-10 p-0 rounded-full',
        'icon-sm': 'size-8 p-0 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
