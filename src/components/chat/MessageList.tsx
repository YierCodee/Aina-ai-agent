import { Suspense, lazy, useEffect, useRef } from 'react'
import { AlertCircle, RotateCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@/hooks/useChat'

// Ekosistem markdown (react-markdown + remark-gfm + unified) cukup berat.
// Jawaban agent baru muncul setelah ada percakapan, jadi modul ini
// dimuat terpisah agar halaman landing tidak ikut memikulnya.
const MarkdownAnswer = lazy(() =>
  import('@/components/chat/MarkdownAnswer').then((m) => ({
    default: m.MarkdownAnswer,
  })),
)

type MessageListProps = {
  messages: ChatMessage[]
  onRetry: () => void
  onStop: () => void
  isBusy: boolean
}

/** Seberapa dekat ke dasar scroll agar auto-scroll tetap aktif. */
const BOTTOM_THRESHOLD_PX = 120

/** Indikator "sedang mengetik" — tiga titik dengan jeda opacity. */
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Agent sedang menjawab">
      {[0, 1, 2].map((step) => (
        <span
          key={step}
          className="size-1.5 rounded-full bg-text-secondary animate-pulse"
          style={{ animationDelay: `${step * 160}ms` }}
        />
      ))}
    </div>
  )
}

/** Label kecil di atas balasan yang memakai web_search. */
function ToolNote({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null
  return (
    <p className="mb-1.5 font-label-sm text-label-sm text-text-secondary">
      Mencari di internet: {tools.join(', ')}
    </p>
  )
}

export function MessageList({ messages, onRetry, onStop, isBusy }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottom = useRef(true)

  // Auto-scroll hanya jalan kalau user sedang di dekat dasar. Memaksa scroll
  // saat mereka sedang membaca pesan panjang di atas sangat mengganggu.
  useEffect(() => {
    const node = endRef.current?.parentElement
    if (!node) return
    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight
      shouldStickToBottom.current = distance < BOTTOM_THRESHOLD_PX
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (shouldStickToBottom.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  })

  return (
    <div
      className="scrollbar-none w-full min-h-0 flex-1 overflow-y-auto"
      // Pesan muncul paling bawah; areas ini yang menggulir, bukan halaman.
      aria-live="polite"
      aria-label="Riwayat percakapan"
    >
      <div className="w-full max-w-[768px] mx-auto flex flex-col gap-5 py-4">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onRetry={onRetry}
            onStop={onStop}
            isBusy={isBusy}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

type MessageRowProps = {
  message: ChatMessage
  onRetry: () => void
  onStop: () => void
  isBusy: boolean
}

function MessageRow({ message, onRetry, onStop, isBusy }: MessageRowProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary-container px-4 py-2.5">
          <p className="font-body-md text-body-md text-on-secondary-container whitespace-pre-wrap break-words">
            {message.text}
          </p>
        </div>
      </div>
    )
  }

  if (message.status === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] w-full rounded-2xl rounded-bl-md bg-error-container px-4 py-3">
          <p className="flex items-start gap-2 font-body-md text-body-md text-on-error-container">
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="break-words">{message.error}</span>
          </p>
          <div className="mt-2.5 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isBusy}
              className="h-8 gap-1.5 font-semibold text-on-error-container hover:bg-error/10"
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
              <span>Coba lagi</span>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border-subtle bg-surface-card px-4 py-3">
        <ToolNote tools={message.toolsUsed ?? []} />

        {message.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <TypingDots />
            <Button
              variant="ghost"
              size="sm"
              onClick={onStop}
              className="h-7 gap-1.5 px-2 font-label-sm text-label-sm text-text-secondary hover:bg-surface-container-low"
            >
              <Square className="size-3 fill-current" aria-hidden="true" />
              <span>Stop</span>
            </Button>
          </div>
        ) : (
          // Fallback setinggi sebaris teks supaya layout tidak melompat
          // selama modul markdown dimuat.
          <Suspense fallback={<p className="font-body-md text-body-md text-text-primary whitespace-pre-wrap break-words">{message.text}</p>}>
            <MarkdownAnswer>{message.text}</MarkdownAnswer>
          </Suspense>
        )}
      </div>
    </div>
  )
}
