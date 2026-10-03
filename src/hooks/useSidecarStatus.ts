import { useCallback, useEffect, useState } from 'react'
import { getSidecarStatus } from '@/lib/tauri'
import type { SidecarStatus } from '@/types'

type UseSidecarStatusResult = {
  status: SidecarStatus | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Cek apakah FastAPI sidecar sudah jalan.
 * Polling ulang setiap `pollIntervalMs` (default 10 detik, 0 = sekali saja).
 */
export function useSidecarStatus(pollIntervalMs = 10_000): UseSidecarStatusResult {
  const [status, setStatus] = useState<SidecarStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await getSidecarStatus()
      setStatus(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal cek sidecar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (pollIntervalMs <= 0) return
    const id = window.setInterval(() => void refresh(), pollIntervalMs)
    return () => window.clearInterval(id)
  }, [refresh, pollIntervalMs])

  return { status, loading, error, refresh }
}
