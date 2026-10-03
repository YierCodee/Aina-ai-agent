import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 420
export const SIDEBAR_DEFAULT_WIDTH = 280

const STORAGE_KEY = 'orbita:sidebar-width'

function clamp(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw == null) return SIDEBAR_DEFAULT_WIDTH
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH
    return clamp(parsed)
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function persist(width: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // storage penuh / diblokir — abaikan, lebar tetap berlaku sesi ini
  }
}

/** Lebar sidebar yang bisa di-drag, di-nudge via keyboard, dan tersimpan. */
export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStoredWidth)
  const [dragging, setDragging] = useState(false)

  const setWidth = useCallback((next: number) => {
    setWidthState((prev) => {
      const clamped = clamp(next)
      if (clamped === prev) return prev
      persist(clamped)
      return clamped
    })
  }, [])

  /** Geser via keyboard: ±10px, Shift ±50px. */
  const nudge = useCallback(
    (delta: number) => {
      setWidthState((prev) => {
        const clamped = clamp(prev + delta)
        if (clamped === prev) return prev
        persist(clamped)
        return clamped
      })
    },
    [],
  )

  const resetWidth = useCallback(() => {
    setWidthState((prev) => {
      if (prev === SIDEBAR_DEFAULT_WIDTH) return prev
      persist(SIDEBAR_DEFAULT_WIDTH)
      return SIDEBAR_DEFAULT_WIDTH
    })
  }, [])

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // hanya pointer utama (klik kiri / sentuh tunggal)
      if (event.isPrimary === false) return
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      const target = event.currentTarget
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // browser lama — drag tetap jalan via window listener di bawah
      }
      setDragging(true)

      const onMove = (moveEvent: PointerEvent) => {
        setWidth(startWidth + (moveEvent.clientX - startX))
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [width, setWidth],
  )

  return { width, dragging, setWidth, nudge, resetWidth, startResize }
}
