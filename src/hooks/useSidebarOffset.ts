import { useLayoutEffect, useRef } from 'react'
import { animate, useMotionValue, useReducedMotion } from 'motion/react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  SIDEBAR_DESKTOP_QUERY,
  SIDEBAR_MOBILE_WIDTH,
  SIDEBAR_MOTION,
} from '@/components/feedback/sidebarMotion'

/**
 * Menulis `--sbw` ke `:root` dan meng-animate-nya mengikuti status sidebar.
 *
 * Kenapa di `:root` dan bukan di div konten: elemen `position: fixed` yang
 * di-portal lewat `FixedLayer` (sidebar, quick-input, toast, FAB) serta
 * `Composer` ikut mewarisi nilai yang sama, jadi semuanya bergeser sinkron.
 *
 * Aturan geraknya:
 * - `open` berubah → tween 0 ↔ `width` selama `SIDEBAR_MOTION`.
 * - `width` berubah (drag / nudge / reset) → `jump` instan, supaya handle
 *   resize tidak terasa rubber-band.
 */
export function useSidebarOffset(open: boolean, width: number) {
  const reduceMotion = useReducedMotion()
  const isDesktop = useMediaQuery(SIDEBAR_DESKTOP_QUERY)
  // Sama dengan panel di `SidebarTransition`, supaya `--sbw` selalu mencerminkan
  // lebar sidebar yang benar-benar terpakai.
  const panelWidth = isDesktop ? width : SIDEBAR_MOBILE_WIDTH
  const value = useMotionValue(open ? panelWidth : 0)
  const prevOpen = useRef(open)

  useLayoutEffect(() => {
    const write = (px: number) => {
      document.documentElement.style.setProperty('--sbw', `${px}px`)
    }
    write(value.get())
    return value.on('change', write)
  }, [value])

  useLayoutEffect(() => {
    const target = open ? panelWidth : 0

    if (reduceMotion || prevOpen.current === open) {
      value.jump(target)
      prevOpen.current = open
      return
    }

    prevOpen.current = open
    const controls = animate(value, target, SIDEBAR_MOTION)
    return () => controls.stop()
  }, [open, panelWidth, reduceMotion, value])
}
