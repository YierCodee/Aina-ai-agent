import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type FixedLayerProps = {
  children: ReactNode
}

const noopSubscribe = () => () => {}

/**
 * `true` di client, `false` di server — dipakai agar portal baru dibuat
 * setelah mount (pola mounted-guard tanpa setState di dalam effect).
 */
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/**
 * Portal ke document.body untuk elemen `position: fixed` yang hidup di dalam
 * subtree halaman.
 *
 * Kenapa perlu: `PageTransition` menerapkan `filter: blur()` pada wrapper-nya.
 * Menurut spesifikasi CSS, nilai `filter` selain `none` membuat elemen tersebut
 * menjadi containing block untuk descendant `position: fixed`. Akibatnya
 * sidebar/backdrop yang seharusnya menempel ke viewport justru bergeser
 * mengikuti offset wrapper dan menimpa konten halaman.
 *
 * Di-portal ke `body`, elemen fixed kembali memakai viewport sebagai
 * containing block, sehingga animasi halaman tetap utuh.
 */
export function FixedLayer({ children }: FixedLayerProps) {
  const isClient = useIsClient()

  if (!isClient) return null
  return createPortal(children, document.body)
}
