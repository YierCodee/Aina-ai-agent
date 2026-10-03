import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/utils/cn'

type PageTransitionProps = {
  pageKey: string
  children: ReactNode
  className?: string
}

/**
 * Transisi antar halaman: exit fade+slide+blur (180ms),
 * enter fade+slide+blur (300ms). Hormati prefers-reduced-motion.
 */
export function PageTransition({ pageKey, children, className }: PageTransitionProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={cn('w-full', className)}>{children}</div>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        className={cn('w-full', className)}
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
