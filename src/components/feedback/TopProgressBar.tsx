import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/utils/cn'

type TopProgressBarProps = {
  active: boolean
  className?: string
}

/**
 * Bar progres tipis di tepi atas viewport.
 * Muncul instan (<150ms) saat pindah halaman agar terasa responsif,
 * lalu fade out saat halaman siap.
 */
export function TopProgressBar({ active, className }: TopProgressBarProps) {
  return (
    <div
      aria-hidden={!active}
      className={cn('pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px]', className)}
    >
      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key="page-progress"
            role="progressbar"
            aria-label="Loading page"
            className="h-full w-full origin-left bg-gradient-to-r from-secondary via-secondary-container to-secondary"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{
              scaleX: [0, 0.4, 0.75],
              opacity: 1,
              transition: {
                scaleX: { duration: 0.5, ease: 'easeOut' },
              },
            }}
            exit={{
              scaleX: 1,
              opacity: 0,
              transition: {
                scaleX: { duration: 0.22, ease: 'easeOut' },
                opacity: { duration: 0.28 },
              },
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
