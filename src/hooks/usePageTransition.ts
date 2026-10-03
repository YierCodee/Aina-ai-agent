import { useCallback, useEffect, useRef, useState } from 'react'

/** Jeda sebelum konten berganti, supaya progress bar sempat terlihat dulu. */
const SWAP_DELAY_MS = 140
/** Total durasi progress bar, dihitung sampai halaman baru selesai masuk. */
const BAR_DURATION_MS = 560

type PageTransitionState = {
  /** Rail yang benar-benar dirender (sudah lewat jeda). */
  displayRail: string
  /** true selama transisi berjalan — dipakai TopProgressBar. */
  pending: boolean
  /** Panggil dari event klik navigasi, bukan dari dalam effect. */
  navigate: (nextRail: string) => void
}

/**
 * Mengatur transisi pindah halaman: rail target dikirim lewat `navigate()`
 * dari event, lalu konten ditunda `SWAP_DELAY_MS` supaya tidak berkedip
 * saat chunk sudah cached.
 */
export function usePageTransition(initialRail: string): PageTransitionState {
  const [displayRail, setDisplayRail] = useState(initialRail)
  const [targetRail, setTargetRail] = useState(initialRail)
  const [pending, setPending] = useState(false)
  // Bertambah tiap navigasi agar timer progress bar selalu di-restart,
  // termasuk saat user mengklik rail berkali-kali dengan cepat.
  const [transitionId, setTransitionId] = useState(0)
  const targetRef = useRef(initialRail)

  const navigate = useCallback((nextRail: string) => {
    if (targetRef.current === nextRail) return
    targetRef.current = nextRail
    setTargetRail(nextRail)
    setPending(true)
    setTransitionId((id) => id + 1)
  }, [])

  // Effect ini hanya menyinkronkan timer, bukan memicu render langsung.
  useEffect(() => {
    if (targetRail === displayRail) return
    const swap = setTimeout(() => setDisplayRail(targetRail), SWAP_DELAY_MS)
    return () => clearTimeout(swap)
  }, [targetRail, displayRail])

  useEffect(() => {
    if (!pending) return
    const hide = setTimeout(() => setPending(false), BAR_DURATION_MS)
    return () => clearTimeout(hide)
  }, [pending, transitionId])

  return { displayRail, pending, navigate }
}
