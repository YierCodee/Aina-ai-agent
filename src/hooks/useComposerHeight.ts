import { useEffect, useRef } from 'react'

/**
 * Mengukur tinggi elemen dan mempublikasikannya sebagai CSS variable
 * `--composer-h` pada elemen `:root`.
 *
 * Composer menempel di bawah layar dengan `position: fixed`, jadi area
 * konten di atasnya harus menyisakan ruang sebesar tinggi sebenarnya.
 * Tinggi Composer berubah mengikuti isi textarea (52px sampai 180px), jadi
 * padding tetap di CSS akan menyisakan ruang kosong atau menutupi pesan
 * terakhir. Mengukurnya membuat keduanya selalu pas.
 *
 * Nilai awal 190px dipakai sebelum pengukuran pertama selesai, supaya
 * tidak ada lompatan tata letak pada render awal.
 */
const FALLBACK_HEIGHT_PX = 190

export const COMPOSER_HEIGHT_VAR = '--composer-h'

/** Ruang tambahan di atas tinggi Composer, untuk jarak dari pesan terakhir. */
const EXTRA_GAP_PX = 16

// Nilai awal dipasang langsung ke stylesheet supaya render pertama sudah
// punya ruang yang cukup, sebelum efek pemukuran sempat berjalan.
document.documentElement.style.setProperty(
  COMPOSER_HEIGHT_VAR,
  `${FALLBACK_HEIGHT_PX + EXTRA_GAP_PX}px`,
)

export function useComposerHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const publish = (height: number) => {
      document.documentElement.style.setProperty(
        COMPOSER_HEIGHT_VAR,
        `${Math.round(height) + EXTRA_GAP_PX}px`,
      )
    }

    publish(node.offsetHeight)

    if (typeof ResizeObserver === 'undefined') {
      // Lingkungan tanpa ResizeObserver (jarang, mis. beberapa test runner):
      // andalkan pengukuran awal saja.
      return
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        publish(entry.contentRect.height)
      }
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty(COMPOSER_HEIGHT_VAR)
    }
  }, [])

  return ref
}
