import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDEBAR_DESKTOP_QUERY, SIDEBAR_MOBILE_WIDTH, SIDEBAR_MOTION } from './sidebarMotion'

type Props = {
  open: boolean
  /** Lebar target dalam px (dari `useSidebarWidth`). */
  width: number
  /** true saat handle di-drag — perubahan `width` harus langsung, bukan tween. */
  dragging?: boolean
  /** Dipanggil saat backdrop drawer diklik (mobile). */
  onClose?: () => void
  children: ReactNode
  className?: string
}

function Backdrop({ onClick, instant }: { onClick?: () => void; instant?: boolean }) {
  return (
    <motion.button
      key="sb-backdrop"
      type="button"
      aria-label="Close sidebar"
      tabIndex={-1}
      onClick={onClick}
      className="fixed inset-y-0 left-[var(--rail-w)] right-0 z-30 h-full bg-on-surface/30 backdrop-blur-[2px] md:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={instant ? { duration: 0 } : SIDEBAR_MOTION}
    />
  )
}

/**
 * Transisi buka/tutup sidebar dengan pola accordion: `width` outer dianimasikan
 * 0 ↔ lebar efektif, bukan slide dari samping.
 *
 * Lebar panel ditangani di sini sepenuhnya:
 * - `--sbw-actual` ditulis ke wrapper ini, lalu dibaca `<aside>` anak lewat
 *   `w-[var(--sbw-actual,280px)]`. Arah baca parent → child ini yang benar;
 *   mendeklarasikan var di child lalu membacanya dari parent (seperti sebelumnya)
 *   selalu jatuh ke fallback, karena custom property hanya mewarisi ke bawah.
 * - Di bawah `md` lebar dikunci ke `SIDEBAR_MOBILE_WIDTH` supaya drawer tidak
 *   melebihi lebar layar.
 *
 * Isi sidebar tidak ikut ter-squish: `<aside>` punya lebar eksplisit sendiri,
 * jadi yang bergerak hanya tepi panelnya.
 *
 * `overflow-hidden` dipaksakan di sini, bukan diserahkan ke pemanggil, karena
 * tanpa clip konten akan meluber keluar sidebar yang sedang menyempit. Konsekuensinya
 * handle resize harus berada di dalam panel (lihat `agent.md`).
 */
export function SidebarTransition({ open, width, dragging, onClose, children, className }: Props) {
  const reduceMotion = useReducedMotion()
  const isDesktop = useMediaQuery(SIDEBAR_DESKTOP_QUERY)
  const panelWidth = isDesktop ? width : SIDEBAR_MOBILE_WIDTH
  const panelStyle = { '--sbw-actual': `${panelWidth}px` } as CSSProperties

  if (reduceMotion) {
    if (!open) return null
    return (
      <>
        <Backdrop onClick={onClose} instant />
        <div className={cn(className, 'overflow-hidden')} style={{ ...panelStyle, width: panelWidth }}>
          {children}
        </div>
      </>
    )
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <>
          <Backdrop onClick={onClose} />
          <motion.div
            key="sb-panel"
            className={cn(className, 'overflow-hidden')}
            style={panelStyle}
            initial={{ width: 0 }}
            animate={{ width: panelWidth }}
            exit={{ width: 0 }}
            transition={{
              ...SIDEBAR_MOTION,
              width: {
                ...SIDEBAR_MOTION,
                duration: dragging ? 0 : SIDEBAR_MOTION.duration,
              },
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
