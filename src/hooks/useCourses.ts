import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCourses, isCoursesAbort } from '@/lib/coursesApi'
import type {
  CourseCounts,
  CourseItem,
  CourseMetrics,
  CoursesSort,
  CoursesTab,
  CourseQuickViewId,
} from '@/data/courses'

const EMPTY_COUNTS: CourseCounts = { all: 0, teori: 0, praktikum: 0, progress: 0 }
const EMPTY_METRICS: CourseMetrics = {
  totalCourses: 0,
  totalSks: 0,
  totalFiles: 0,
  avgProgress: 0,
  dedicatedTutors: 0,
  ragIsolation: 0,
}

export type UseCoursesResult = {
  items: CourseItem[]
  counts: CourseCounts
  metrics: CourseMetrics
  termLabel: string
  total: number
  /** True hanya untuk request pertama — filter berikutnya tidak mengosongkan layar. */
  loading: boolean
  error: string | null
  refetch: () => void
}

export type UseCoursesFilters = {
  query: string
  sidebarQuery: string
  tab: CoursesTab
  quickView: CourseQuickViewId
  sort: CoursesSort
}

/** Jeda sebelum query dikirim, agar mengetik tidak memicu request tiap huruf. */
const DEBOUNCE_MS = 220

/**
 * State & pemuatan daftar matkul dari backend.
 *
 * Filter, pencarian, dan sort terjadi di SQL — hook ini hanya 상태 lokal
 * (kondisi filter) + debounce + pemanggilan endpoint. Tidak ada lagi `useMemo`
 * yang memfilter array lokal.
 *
 * `sidebarQuery` sengaja tidak dikirim ke server sebagai `q`: di UI lama, kolom
 * search sidebar memfilter title+code+dosen (tanpa tutor), sedangkan kolom
 * search utama menyertakan tutor. Dua itu beda cakupan, jadi tidak boleh
 * digabung — jika digabung, mengetik di sidebar akan tiba-tiba menampilkan
 * hasil berbeda dari yang diketik.
 */
export function useCourses(filters: UseCoursesFilters): UseCoursesResult {
  const { query, sidebarQuery, tab, quickView, sort } = filters
  const [items, setItems] = useState<CourseItem[]>([])
  const [counts, setCounts] = useState<CourseCounts>(EMPTY_COUNTS)
  const [metrics, setMetrics] = useState<CourseMetrics>(EMPTY_METRICS)
  const [termLabel, setTermLabel] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Dipisah dari `loading` karena(screen kosong) hanya perlu muncul untuk
  // request PERTAMA. Filter berikutnya tidak boleh mengosongkan layar.
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setError(null)
      void (async () => {
        try {
          const data = await fetchCourses(
            {
              q: query,
              // Quick view sudah membatasi jenis matkul, jadi tab tidak perlu
              // dikirim dua-duanya — server menerapkan keduanya sekaligus (AND).
              tab: tab,
              quickView: quickView,
              sort: sort,
            },
            { signal: controller.signal },
          )
          setItems(data.items)
          setCounts(data.counts)
          setMetrics(data.metrics)
          setTermLabel(data.termLabel)
          setTotal(data.total)
          setHasLoaded(true)
        } catch (e) {
          if (isCoursesAbort(e)) return
          setError(e instanceof Error ? e.message : 'Gagal memuat matkul.')
          setItems([])
          setCounts(EMPTY_COUNTS)
          setMetrics(EMPTY_METRICS)
          setTotal(0)
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, sidebarQuery, tab, quickView, sort, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return useMemo(
    () => ({
      items,
      counts,
      metrics,
      termLabel,
      total,
      loading: loading && !hasLoaded,
      error,
      refetch,
    }),
    [items, counts, metrics, termLabel, total, loading, hasLoaded, error, refetch],
  )
}
