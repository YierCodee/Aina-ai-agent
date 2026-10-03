import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatApiError,
  deleteAllSessions,
  deleteSession,
  getSessionMessages,
  isAbortError,
  listSessions,
  sendChatMessage,
} from '@/lib/chatApi'

/** Satu pesan dalam percakapan. */
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** `pending` = masih menunggu balasan, `error` = gagal, `done` = selesai. */
  status: 'pending' | 'done' | 'error'
  /** Pesan error yang sudah siap ditampilkan, hanya untuk `status: 'error'`. */
  error?: string
  /** Tool yang dipanggil agent pada turn ini, mis. `['web_search']`. */
  toolsUsed?: string[]
}

/**
 * Satu percakapan utuh.
 *
 * `id` **adalah** `session_id` backend (SQLite `chat_sessions.id`) — tidak
 * ada lagi pemisahan `thread.id` vs `thread.sessionId`. Backend menyimpan
 * tiap turn, jadi reload halaman tinggal baca ulang lewat
 * `GET /api/sessions`.
 */
export type ChatThread = {
  id: string
  /** Diturunkan dari pesan user pertama; `UNTITLED` sampai pesan itu ada. */
  title: string
  messages: ChatMessage[]
  updatedAt: number
  /**
   * True kalau isi `messages` sudah sinkron dengan backend.
   * Thread dari daftar sesi mulai `false` (lazy-load saat dipilih);
   * thread lokal baru langsung `true`.
   */
  loaded: boolean
  /** Jumlah pesan di backend (untuk sidebar sebelum lazy-load). */
  messageCount: number
}

type UseChatResult = {
  threads: ChatThread[]
  activeThreadId: string | null
  /** Pesan thread aktif. Turunan, bukan state sendiri, supaya tidak bisa basi. */
  messages: ChatMessage[]
  isBusy: boolean
  /** True selama daftar sesi diambil dari backend saat pertama dibuka. */
  isLoadingHistory: boolean
  /** Kirim pesan. Return true kalau dispatch jalan, false kalau diblokir guard. */
  send: (text: string) => boolean
  stop: () => void
  retry: () => void
  /** Buat thread kosong dan jadikan aktif. */
  newThread: () => void
  selectThread: (id: string) => void
  /** Hapus thread di backend + state lokal. */
  deleteThread: (id: string) => void
  /** Hapus seluruh riwayat di backend + reset ke thread kosong. */
  clearHistory: () => void
  /** Tarik ulang daftar sesi, mempertahankan isi thread yang sudah dimuat. */
  refreshThreads: () => Promise<void>
}

/** Teks yang dipasang kalau user menekan Stop di tengah jawaban. */
const STOPPED_TEXT = '…dihentikan oleh pengguna.'

/** Judul placeholder sampai thread punya pesan user pertama. */
export const UNTITLED_THREAD = 'New Chat'

/** Panjang maksimum judul thread sebelum dipotong. */
const TITLE_MAX_CHARS = 60

const USER_ID = 'mahasiswa'

let messageCounter = 0

function nextId(): string {
  messageCounter += 1
  return `m${Date.now().toString(36)}-${messageCounter}`
}

function newSessionId(): string {
  return `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeThread(): ChatThread {
  return {
    id: newSessionId(),
    title: UNTITLED_THREAD,
    messages: [],
    updatedAt: Date.now(),
    loaded: true,
    messageCount: 0,
  }
}

/**
 * Judul thread dari pesan user pertama.
 *
 * Spasi berulang diratakan supaya judul tidak pecah baris, lalu dipotong di
 * batas kata terdekat supaya tidak menggantung kata setengah jadi.
 */
function deriveTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= TITLE_MAX_CHARS) return flat
  const cut = flat.slice(0, TITLE_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  const body = lastSpace > TITLE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut
  return `${body}…`
}

function toMs(value: string | null, fallback: number): number {
  if (!value) return fallback
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? fallback : ms
}

/**
 * Seluruh state percakapan: daftar thread beserta isi masing-masing.
 *
 * Sidebar dan area chat membaca dari hook yang sama, jadi keduanya tidak
 * mungkin menunjukkan percakapan yang berbeda.
 *
 * Riwayat persisten di SQLite backend: daftar sesi dimuat sekali saat mount,
 * isi pesan dimuat lazy saat thread dipilih. Menutup aplikasi tidak lagi
 * mengosongkan riwayat.
 */
export function useChat(): UseChatResult {
  const [initialThread] = useState<ChatThread>(() => makeThread())
  const [threads, setThreads] = useState<ChatThread[]>(() => [initialThread])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialThread.id,
  )
  const [isBusy, setIsBusy] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  // Mirror state ke ref supaya `loadSessions` (useCallback []) tidak membaca
  // closure basi. Tanpa ini, `activeThreadId` di dalam fetch mount selalu ID
  // lokal awal dan rekonsiliasi tidak pernah benar. Sinkron lewat effect agar
  // tidak tulis ref saat render (aturan react-compiler).
  const threadsRef = useRef(threads)
  const activeRef = useRef(activeThreadId)
  useEffect(() => {
    threadsRef.current = threads
  }, [threads])
  useEffect(() => {
    activeRef.current = activeThreadId
  }, [activeThreadId])

  // Muat ulang daftar sesi dari backend.
  //
  // Dipakai dua kali: sekali saat aplikasi dibuka, dan sekali lagi setelah
  // `POST /api/courses/{id}/tutor-session` membuat sesi baru. Tanpa yang kedua,
  // sesi tutor ada di backend tapi tidak pernah muncul di sidebar — dan
  // `selectThread` tidak akan bisa mengirim pesan ke sana karena `send` mencari
  // thread di state lokal.
  //
  // `keepMessages` dipakai saat refresh manual: isi thread yang sudah dimuat
  // tidak dibuang, jadi history yang sedang dibaca tidak hilang.
  //
  // Perbaikan bug "kirim tidak muncul": setelah fetch, `activeThreadId` yang
  // yatim (ID lokal yang tidak ada di backend) direkonsiliasi ke sesi terbaru.
  // Thread lokal yang sudah punya pesan optimistik tidak pernah dibuang agar
  // kirim cepat sebelum fetch selesai tidak hilang.
  const loadSessions = useCallback(
    async (options: { signal?: AbortSignal; keepMessages?: boolean } = {}) => {
      try {
        const { sessions } = await listSessions({
          userId: USER_ID,
          limit: 50,
          signal: options.signal,
        })
        if (options.signal?.aborted) return
        if (sessions.length === 0) {
          const snapshot = threadsRef.current
          if (options.keepMessages && snapshot.length > 0) return
          const hasUsable = snapshot.some(
            (t) => t.messages.length > 0 || t.messageCount > 0,
          )
          if (hasUsable) {
            // Ada pesan lokal (mis. baru dikirim saat offline): jangan timpa.
            const firstUsable =
              snapshot.find((t) => t.id === activeRef.current) ?? snapshot[0]
            if (firstUsable && activeRef.current !== firstUsable.id) {
              setActiveThreadId(firstUsable.id)
            }
            return
          }
          const thread = makeThread()
          setThreads([thread])
          setActiveThreadId(thread.id)
          return
        }
        const snapshot = threadsRef.current
        const previous = new Map(snapshot.map((thread) => [thread.id, thread]))
        const backendIds = new Set(sessions.map((s) => s.id))
        const mapped: ChatThread[] = sessions.map((session) => {
          const existing = options.keepMessages
            ? previous.get(session.id)
            : previous.get(session.id)?.loaded
              ? previous.get(session.id)
              : undefined
          return {
            id: session.id,
            title: session.title?.trim() ? session.title : UNTITLED_THREAD,
            messages: existing?.messages ?? [],
            updatedAt: toMs(session.updated_at, Date.now()),
            loaded: existing?.loaded ?? false,
            messageCount: session.message_count,
          }
        })
        // Thread lokal berpesan yang belum ada di backend (optimistic send
        // selama fetch berjalan) ditaruh di depan supaya tidak hilang.
        const localsToKeep = snapshot.filter(
          (t) => !backendIds.has(t.id) && t.messages.length > 0,
        )
        const next = [...localsToKeep, ...mapped]
        setThreads(next)
        const prevActive = activeRef.current
        const stillExists =
          prevActive !== null && next.some((t) => t.id === prevActive)
        if (!stillExists) {
          // Yatim: ID lokal awal tidak ada di backend. Buka sesi terbaru
          // supaya `send` tidak early-return diam-diam.
          const fallback = next[0]
          if (fallback) {
            setActiveThreadId(fallback.id)
            // Lazy-load isi sesi terbaru di background agar area chat tidak
            // stuck di landing padahal riwayat ada.
            if (!fallback.loaded && fallback.messageCount > 0) {
              void (async () => {
                try {
                  const history = await getSessionMessages(fallback.id, {
                    limit: 500,
                  })
                  setThreads((current) =>
                    current.map((item) =>
                      item.id === fallback.id
                        ? {
                            ...item,
                            loaded: true,
                            messageCount: history.length,
                            messages: history
                              .filter(
                                (entry) =>
                                  entry.role === 'user' ||
                                  entry.role === 'assistant',
                              )
                              .map((entry) => ({
                                id: `h${entry.id}`,
                                role: entry.role as 'user' | 'assistant',
                                text: entry.content,
                                status: 'done' as const,
                                toolsUsed: entry.tools_used,
                              })),
                            title:
                              item.title === UNTITLED_THREAD
                                ? deriveTitle(
                                    history.find((e) => e.role === 'user')
                                      ?.content ?? item.title,
                                  )
                                : item.title,
                          }
                        : item,
                    ),
                  )
                } catch {
                  setThreads((current) =>
                    current.map((item) =>
                      item.id === fallback.id
                        ? { ...item, loaded: true }
                        : item,
                    ),
                  )
                }
              })()
            }
          }
        }
        return
      } catch {
        if (options.signal?.aborted) return
        // Backend belum jalan / offline: biarkan thread yang ada tetap
        // tersedia agar user bisa mengetik; sinkronisasi terjadi saat kirim.
        const snapshot = threadsRef.current
        if (snapshot.length === 0) {
          const thread = makeThread()
          setThreads([thread])
          setActiveThreadId(thread.id)
        }
      } finally {
        if (!options.signal?.aborted) setIsLoadingHistory(false)
      }
    },
    [],
  )

  // Muat daftar sesi dari backend sekali saat dibuka.
  //
  // Sengaja TANPA guard ref: di dev, StrictMode menjalankan efek 2x
  // (mount → cleanup → mount ulang). Guard ref membuat run kedua return
  // dini sehingga fetch tidak pernah terjadi. Dengan pola abort-per-run,
  // run pertama di-abort saat cleanup dan run kedua fetch bersih.
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      if (cancelled) return
      await loadSessions({ signal: controller.signal })
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [loadSessions])

  /**
   * Tarik ulang daftar sesi tanpa membuang isi thread yang sudah dimuat.
   * Dipanggil setelah membuat sesi tutor dari halaman Courses.
   */
  const refreshThreads = useCallback(async () => {
    await loadSessions({ keepMessages: true })
  }, [loadSessions])

  const messages = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId)?.messages ?? [],
    [threads, activeThreadId],
  )

  /** Perbarui satu pesan di dalam satu thread. */
  const patchMessage = useCallback((threadId: string, messageId: string, patch: Partial<ChatMessage>) => {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: Date.now(),
              messages: thread.messages.map((item) =>
                item.id === messageId ? { ...item, ...patch } : item,
              ),
            }
          : thread,
      ),
    )
  }, [])

  /**
   * Kirim satu pesan ke thread tertentu dan perbarui pesannya sesuai hasilnya.
   *
   * `threadId` di sini langsung dipakai sebagai `session_id` backend.
   * Pesan placeholder dibuat lebih dulu supaya UI langsung menampilkan "sedang
   * mengetik" tanpa menunggu jaringan.
   */
  const dispatch = useCallback(
    async (threadId: string, userText: string) => {
      const userId = nextId()
      const assistantId = nextId()
      const controller = new AbortController()
      abortRef.current = controller

      setIsBusy(true)
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                title: thread.title === UNTITLED_THREAD ? deriveTitle(userText) : thread.title,
                updatedAt: Date.now(),
                messageCount: thread.messageCount + 2,
                messages: [
                  ...thread.messages,
                  { id: userId, role: 'user', text: userText, status: 'done' },
                  { id: assistantId, role: 'assistant', text: '', status: 'pending' },
                ],
              }
            : thread,
        ),
      )

      try {
        const result = await sendChatMessage({
          message: userText,
          sessionId: threadId,
          signal: controller.signal,
        })
        patchMessage(threadId, assistantId, {
          text: result.reply,
          status: 'done',
          toolsUsed: result.tools_used,
        })
      } catch (error) {
        // Cancel bukan kegagalan — jangan tampilkan sebagai error.
        if (isAbortError(error)) {
          patchMessage(threadId, assistantId, { text: STOPPED_TEXT, status: 'done' })
          return
        }
        patchMessage(threadId, assistantId, {
          status: 'error',
          error: error instanceof ChatApiError ? error.message : 'Terjadi kesalahan.',
        })
      } finally {
        abortRef.current = null
        setIsBusy(false)
      }
    },
    [patchMessage],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isBusy || !activeThreadId) return false
      const thread = threads.find((item) => item.id === activeThreadId)
      if (!thread) {
        // Seharusnya tidak terjadi lagi setelah rekonsiliasi loadSessions,
        // tapi jangan diam: log agar terlihat di console saat debug.
        if (typeof console !== 'undefined') {
          console.warn(
            `[useChat] send dibatalkan: activeThreadId ${activeThreadId} tidak ada di ${threads.length} thread.`,
          )
        }
        return false
      }
      void dispatch(thread.id, trimmed)
      return true
    },
    [dispatch, isBusy, threads, activeThreadId],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /**
   * Kirim ulang pesan user terakhir pada thread aktif.
   *
   * Pesan assistant yang gagal dibuang lebih dulu supaya tidak ada dua
   * balasan untuk satu pertanyaan. Kalau tidak ada yang gagal (misal user
   * menekan retry setelah membatalkan), balasan terakhir ikut dibuang agar
   * pesan lama tergantikan.
   */
  const retry = useCallback(() => {
    if (isBusy || !activeThreadId) return
    const thread = threads.find((item) => item.id === activeThreadId)
    if (!thread) return
    const lastUser = [...thread.messages].reverse().find((item) => item.role === 'user')
    if (!lastUser) return
    setThreads((current) =>
      current.map((item) => {
        if (item.id !== activeThreadId) return item
        const lastAssistantIndex = item.messages.map((entry) => entry.role).lastIndexOf('assistant')
        if (lastAssistantIndex === -1) return item
        return {
          ...item,
          messages: item.messages.filter((_, index) => index !== lastAssistantIndex),
        }
      }),
    )
    void dispatch(thread.id, lastUser.text)
  }, [dispatch, isBusy, threads, activeThreadId])

  /**
   * Ambil isi pesan satu thread dari backend (lazy-load).
   * Idempotent: tidak fetch ulang kalau sudah `loaded` atau sedang sibuk
   * mengirim di thread itu.
   */
  const ensureLoaded = useCallback(
    async (id: string) => {
      const thread = threads.find((item) => item.id === id)
      if (!thread || thread.loaded) return
      try {
        const history = await getSessionMessages(id, { limit: 500 })
        setThreads((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  loaded: true,
                  messageCount: history.length,
                  updatedAt: item.updatedAt,
                  messages: history
                    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
                    .map((entry) => ({
                      id: `h${entry.id}`,
                      role: entry.role as 'user' | 'assistant',
                      text: entry.content,
                      status: 'done' as const,
                      toolsUsed: entry.tools_used,
                    })),
                  title:
                    item.title === UNTITLED_THREAD
                      ? deriveTitle(
                          history.find((entry) => entry.role === 'user')?.content ?? item.title,
                        )
                      : item.title,
                }
              : item,
          ),
        )
      } catch {
        // Gagal load (mis. thread lokal yang belum ada di backend):
        // tandai loaded agar tidak fetch berulang.
        setThreads((current) =>
          current.map((item) =>
            item.id === id ? { ...item, loaded: true } : item,
          ),
        )
      }
    },
    [threads],
  )

/**
   * Mulai percakapan baru.
   *
   * Kalau thread aktif masih kosong, dia yang dipakai lagi supaya menekan
   * "New Chat" berulang kali tidak menumpuk thread kosong di state.
   */
  const newThread = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const active = threads.find((thread) => thread.id === activeThreadId)
    if (active && active.messages.length === 0 && active.messageCount === 0) {
      setActiveThreadId(active.id)
    } else {
      const thread = makeThread()
      setThreads((current) => [...current, thread])
      setActiveThreadId(thread.id)
    }
    setIsBusy(false)
  }, [threads, activeThreadId])

  /** Pindah ke thread lain, lazy-load isinya, batalkan request berjalan. */
  const selectThread = useCallback(
    (id: string) => {
      abortRef.current?.abort()
      abortRef.current = null
      setIsBusy(false)
      setActiveThreadId(id)
      void ensureLoaded(id)
    },
    [ensureLoaded],
  )

  /** Hapus thread di backend (best-effort) + state lokal. */
  const deleteThread = useCallback(
    (id: string) => {
      void deleteSession(id).catch(() => {
        // Backend belum punya sesi ini (thread lokal) — abaikan.
      })
      const rest = threads.filter((thread) => thread.id !== id)
      if (rest.length === 0) {
        const thread = makeThread()
        setThreads([thread])
        setActiveThreadId(thread.id)
      } else {
        setThreads(rest)
        if (activeThreadId === id) setActiveThreadId(rest[0].id)
      }
    },
    [threads, activeThreadId],
  )

  /** Hapus SELURUH riwayat di backend + reset ke thread kosong baru. */
  const clearHistory = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsBusy(false)
    void deleteAllSessions(USER_ID).catch(() => {
      // Backend offline — tetap reset tampilan lokal.
    })
    const thread = makeThread()
    setThreads([thread])
    setActiveThreadId(thread.id)
  }, [])

  return {
    threads,
    activeThreadId,
    messages,
    isBusy,
    isLoadingHistory,
    send,
    stop,
    retry,
    newThread,
    selectThread,
    deleteThread,
    clearHistory,
    refreshThreads,
  }
}
