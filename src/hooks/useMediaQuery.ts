import { useSyncExternalStore } from 'react'

/**
 * `true` kalau media query saat ini cocok. Dipakai lewat `useSyncExternalStore`
 * supaya tidak ada `setState` di dalam effect (lolos lint React Compiler).
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
