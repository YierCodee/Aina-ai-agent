/**
 * Klien chat untuk FastAPI sidecar.
 *
 * Pola ini sengaja meniru `lib/tauri.ts`: memakai `fetch` langsung, bukan
 * `invoke`, karena `tauri.conf.json` memakai `"csp": null`. Tanpa CSP, webview
 * Tauri bebas melakukan fetch ke localhost, jadi tidak perlu command Rust
 * untuk menjembatani request ini.
 */
import { SIDECAR_BASE_URL } from '@/lib/sidecar'

/** Bentuk balasan sukses dari `POST /api/chat`. */
export type ChatReply = {
  reply: string
  session_id: string
  tools_used: string[]
  model: string
}

/** Satu sesi dari `GET /api/sessions`. `id` = session_id backend. */
export type HistorySession = {
  id: string
  user_id: string
  title: string
  model: string | null
  message_count: number
  created_at: string | null
  updated_at: string | null
}

/** Satu pesan dari `GET /api/sessions/{id}/messages`. */
export type HistoryMessage = {
  id: number
  role: string
  content: string
  tools_used: string[]
  model: string | null
  created_at: string | null
}

/**
 * Error chat yang sudah diterjemahkan ke pesan berbahasa manusia.
 *
 * `status` null berarti request tidak pernah sampai ke sidecar — biasanya
 * karena proses backend belum jalan, bukan karena ada yang salah dengan
 * pesan mahasiswa.
 */
export class ChatApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ChatApiError'
    this.status = status
  }
}

/** Pesan yang bisa ditampilkan ke pengguna untuk setiap status HTTP. */
const STATUS_MESSAGES: Record<number, string> = {
  422: 'Pesan tidak valid.',
  502: 'Panggilan ke model gagal. Coba lagi sebentar.',
  503: 'Agent belum siap. Periksa GEMINI_API_KEY di backend/.env.',
  504: 'Agent terlalu lama menjawab. Coba pertanyaan yang lebih sederhana.',
}

const OFFLINE_MESSAGE = 'Tidak bisa menghubungi sidecar. Pastikan backend berjalan.'

/**
 * Ambil teks pesan dari balisan error FastAPI.
 *
 * FastAPI memakai `{"detail": "..."}` untuk error yang kita lempar manual,
 * tapi bentuk validation error punya `detail` berupa array objek, jadi
 * perlu dijaga agar tidak pernah ikut ditampilkan mentah ke pengguna.
 */
function readErrorDetail(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const detail = (payload as { detail?: unknown }).detail
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null
}

/**
 * Kirim satu pesan ke agent dan tunggu jawaban lengkapnya.
 *
 * Endpoint ini tidak memakai streaming: satu request, satu balasan utuh.
 *
 * @throws {ChatApiError} Untuk status HTTP di luar 2xx, kegagalan jaringan,
 *   atau saat request dibatalkan lewat `signal`.
 */
export async function sendChatMessage(options: {
  message: string
  sessionId: string
  signal: AbortSignal
}): Promise<ChatReply> {
  let response: Response
  try {
    response = await fetch(`${SIDECAR_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        message: options.message,
        session_id: options.sessionId,
      }),
    })
  } catch (cause) {
    // AbortError berarti user menekan Stop, bukan kegagalan — biarkan
    // pemanggil membedakannya lewat `isAbortError`.
    if (isAbortError(cause)) {
      throw new ChatApiError('Permintaan dibatalkan.', null)
    }
    throw new ChatApiError(OFFLINE_MESSAGE, null)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Body bukan JSON. Untuk status non-2xx, pesan generik sudah cukup.
    payload = null
  }

  if (!response.ok) {
    const detail = readErrorDetail(payload)
    throw new ChatApiError(
      detail ?? STATUS_MESSAGES[response.status] ?? 'Terjadi kesalahan.',
      response.status,
    )
  }

  const data = payload as Partial<ChatReply> | null
  if (typeof data?.reply !== 'string' || !data.reply.trim()) {
    throw new ChatApiError('Balasan agent kosong.', response.status)
  }

  return {
    reply: data.reply,
    session_id: data.session_id ?? options.sessionId,
    tools_used: Array.isArray(data.tools_used) ? data.tools_used : [],
    model: data.model ?? '',
  }
}

/** True kalau sebuah error akibat `AbortController`, bukan error jaringan. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof ChatApiError && error.message === 'Permintaan dibatalkan.')
    return true
  // `fetch` yang di-abort melempar DOMException, bukan ChatApiError.
  // Tanpa ini, tombol Stop dikira offline dan tampil error merah.
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function throwForStatus(response: Response, payload: unknown): never {
  const detail = readErrorDetail(payload)
  throw new ChatApiError(
    detail ?? STATUS_MESSAGES[response.status] ?? 'Terjadi kesalahan.',
    response.status,
  )
}

/**
 * Daftar sesi terbaru. Dipakai sekali saat aplikasi dibuka untuk
 * mengembalikan riwayat chat yang tersimpan di SQLite backend.
 */
export async function listSessions(options?: {
  userId?: string
  limit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<{ total: number; sessions: HistorySession[] }> {
  const params = new URLSearchParams({
    user_id: options?.userId ?? 'mahasiswa',
    limit: String(options?.limit ?? 50),
    offset: String(options?.offset ?? 0),
  })
  let response: Response
  try {
    response = await fetch(`${SIDECAR_BASE_URL}/api/sessions?${params}`, {
      signal: options?.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ChatApiError('Permintaan dibatalkan.', null)
    }
    throw new ChatApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  const data = payload as Partial<{ total: number; sessions: HistorySession[] }>
  return { total: 0, ...data, sessions: Array.isArray(data?.sessions) ? data.sessions : [] }
}

/** Isi pesan satu sesi, urut dari yang terlama. */
export async function getSessionMessages(
  sessionId: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<HistoryMessage[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 500) })
  let response: Response
  try {
    response = await fetch(
      `${SIDECAR_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/messages?${params}`,
      { signal: options?.signal },
    )
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ChatApiError('Permintaan dibatalkan.', null)
    }
    throw new ChatApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  const messages = (payload as Partial<{ messages: HistoryMessage[] }>)?.messages
  return Array.isArray(messages) ? messages : []
}

/** Hapus satu sesi beserta pesannya di backend. */
export async function deleteSession(sessionId: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(
      `${SIDECAR_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    )
  } catch {
    throw new ChatApiError(OFFLINE_MESSAGE, null)
  }
  if (!response.ok && response.status !== 204) {
    throwForStatus(response, await readJson(response))
  }
}

/** Hapus SELURUH sesi milik user. Return jumlah sesi terhapus. */
export async function deleteAllSessions(userId = 'mahasiswa'): Promise<number> {
  const params = new URLSearchParams({ user_id: userId })
  let response: Response
  try {
    response = await fetch(`${SIDECAR_BASE_URL}/api/sessions?${params}`, {
      method: 'DELETE',
    })
  } catch {
    throw new ChatApiError(OFFLINE_MESSAGE, null)
  }
  const payload = await readJson(response)
  if (!response.ok) throwForStatus(response, payload)
  const deleted = (payload as Partial<{ deleted: number }>)?.deleted
  return typeof deleted === 'number' ? deleted : 0
}
