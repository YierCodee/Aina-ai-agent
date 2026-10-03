import { invoke } from '@tauri-apps/api/core'
import { SIDECAR_BASE_URL } from '@/lib/sidecar'
import type { SidecarStatus } from '@/types'

/**
 * Helper invoke() ke backend Tauri — terpusat di satu file
 * supaya mudah di-mock saat berjalan di browser (vite dev).
 */

export async function getSidecarStatus(): Promise<SidecarStatus> {
  // Di browser biasa (bukan Tauri), fallback ke fetch langsung.
  if (!('__TAURI_INTERNALS__' in window)) {
    try {
      const res = await fetch(`${SIDECAR_BASE_URL}/health`)
      const detail = await res.text()
      return { running: res.ok, url: SIDECAR_BASE_URL, detail }
    } catch (e) {
      return {
        running: false,
        url: SIDECAR_BASE_URL,
        detail: e instanceof Error ? e.message : 'sidecar belum jalan',
      }
    }
  }
  return invoke<SidecarStatus>('sidecar_status')
}

export async function greet(name: string): Promise<string> {
  if (!('__TAURI_INTERNALS__' in window)) {
    return `Halo, ${name}! (mode browser — tanpa Tauri)`
  }
  return invoke<string>('greet', { name })
}
