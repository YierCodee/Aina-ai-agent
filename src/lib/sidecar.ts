/**
 * Alamat FastAPI sidecar, dipakai bersama oleh semua klien yang bicara
 * ke backend.
 *
 * Ditaruh di satu file supaya `lib/tauri.ts` dan `lib/chatApi.ts` tidak
 * masing-masing menuliskan URL yang sama secara literal.
 */
export const SIDECAR_BASE_URL = 'http://127.0.0.1:8471'
