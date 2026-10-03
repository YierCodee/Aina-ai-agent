import { SIDEBAR_DEFAULT_WIDTH } from '@/hooks/useSidebarWidth'

/**
 * Motion sidebar — dipakai bersama oleh `SidebarTransition` (lebar panel) dan
 * `useSidebarOffset` (lebar `--sbw` di `:root`).
 *
 * Keduanya harus punya durasi + easing yang persis sama dan mulai di frame yang
 * sama, supaya tepi kanan sidebar dan tepi kiri konten bergerak beriringan
 * tanpa saling mengejar.
 */
export const SIDEBAR_MOTION = { duration: 0.22, ease: 'easeOut' } as const

export const SIDEBAR_DESKTOP_QUERY = '(min-width: 768px)'

/**
 * Di bawah `md` sidebar jadi drawer overlay, jadi lebarnya dikunci ke default.
 * Tanpa ini, lebar 420px yang tersimpan dari desktop akan membuat drawer lebih
 * lebar dari layar HP.
 */
export const SIDEBAR_MOBILE_WIDTH = SIDEBAR_DEFAULT_WIDTH
