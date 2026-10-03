/**
 * Token warna avatar yang dipakai bersama halaman Courses dan Files.
 *
 * Kenapa ada file ini: warna avatar berasal dari database sebagai TOKEN
 * (`surface-dark`), bukan sebagai class CSS. Class CSS tetap urusan frontend.
 * Kalau class-nya ikut lewat JSON, setiap ganti tema di `index.css` butuh
 * migrasi data.
 *
 * PENTING — jangan diubah jadi template string. Tailwind v4 memindai source
 * untuk menemukan nama class. Class yang hanya muncul di respons API tidak
 * pernah ikut ter-generate, dan avatar jadi tidak berwarna. Karena itu seluruh
 * class avatar harus muncul sebagai literal di `TONE_CLASSES`.
 */

export type AvatarTone =
  | 'secondary'
  | 'success-emerald'
  | 'tertiary-container'
  | 'primary-container'
  | 'surface-tint'
  | 'surface-dark'

export const TONE_CLASSES: Record<AvatarTone, string> = {
  secondary: 'bg-secondary',
  'success-emerald': 'bg-success-emerald',
  'tertiary-container': 'bg-tertiary-container',
  'primary-container': 'bg-primary-container',
  'surface-tint': 'bg-surface-tint',
  'surface-dark': 'bg-surface-dark',
}

/** Class Tailwind untuk token. Token tak dikenal -> default, bukan `undefined`. */
export function toneClass(tone: AvatarTone | null | undefined): string {
  if (!tone) return TONE_CLASSES.secondary
  return TONE_CLASSES[tone] ?? TONE_CLASSES.secondary
}
