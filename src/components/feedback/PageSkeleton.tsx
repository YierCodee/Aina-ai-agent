import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/utils/cn'

export type PageSkeletonVariant = 'files' | 'tasks' | 'courses' | 'settings'

type PageSkeletonProps = {
  variant: PageSkeletonVariant
  label?: string
  className?: string
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const block = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: 'easeOut' as const },
  },
}

/** Satu blok shimmer yang ikut stagger container. */
function Block({ className }: { className: string }) {
  return (
    <motion.div variants={block}>
      <div aria-hidden="true" className={cn('skeleton-shimmer', className)} />
    </motion.div>
  )
}

const STATS = ['h-32 rounded-2xl', 'h-32 rounded-2xl', 'h-32 rounded-2xl', 'h-32 rounded-2xl']

function StatsGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((size, i) => (
        <Block key={i} className={size} />
      ))}
    </div>
  )
}

function TwoColumn() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <Block key={i} className="h-96 rounded-2xl" />
      ))}
    </div>
  )
}

/**
 * Skeleton shimmer + stagger yang meniru struktur tiap halaman.
 * Satu komponen ini menggantikan 4 fallback `animate-pulse` di AppLayout.
 */
export function PageSkeleton({ variant, label, className }: PageSkeletonProps) {
  const reduceMotion = useReducedMotion()
  const ariaLabel = label ?? `Loading ${variant}`

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 sm:px-6',
        className,
      )}
      variants={container}
      initial={reduceMotion ? false : 'hidden'}
      animate="show"
    >
      <span className="sr-only">{ariaLabel}</span>

      {variant === 'files' && (
        <>
          <Block className="h-24 rounded-xl" />
          <StatsGrid />
          <Block className="h-96 rounded-xl" />
        </>
      )}

      {variant === 'tasks' && (
        <>
          <StatsGrid />
          <Block className="h-20 rounded-2xl" />
          <Block className="h-96 rounded-2xl" />
        </>
      )}

      {variant === 'courses' && (
        <>
          <StatsGrid />
          <Block className="h-20 rounded-2xl" />
          <TwoColumn />
        </>
      )}

      {variant === 'settings' && (
        <>
          <Block className="h-32 rounded-2xl" />
          <Block className="h-64 rounded-2xl" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <Block key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
