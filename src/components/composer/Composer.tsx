import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { Paperclip, Mic, ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SourcePicker } from './SourcePicker'
import { useComposerHeight } from '@/hooks/useComposerHeight'

type ComposerProps = {
  value: string
  source: string
  onChange: (value: string) => void
  onSourceChange: (source: string) => void
  onSend: () => void
  /** True ketika satu turn masih berjalan — tombol berubah jadi Stop. */
  isBusy: boolean
  onStop: () => void
}

const COMPOSER_MIN_HEIGHT = 52
const COMPOSER_MAX_HEIGHT = 180

export function Composer({
  value,
  source,
  onChange,
  onSourceChange,
  onSend,
  isBusy,
  onStop,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isEmpty = value.trim().length === 0

  // Composer menempel di bawah layar, jadi area pesan di atasnya harus
  // menyisakan ruang sebesar tinggi sebenarnya. Tinggi ini berubah mengikuti
  // isi textarea, jadi tidak bisa ditulis sebagai nilai tetap di CSS.
  const rootRef = useComposerHeight<HTMLDivElement>()

  // Auto-grow mengikuti desain: tinggi mengikuti isi, clamp 52px–180px
  useLayoutEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(Math.max(node.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)}px`
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Saat agent sedang menjawab, Enter tidak boleh mengirim pesan baru.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!isBusy) onSend()
    }
  }

  return (
    <div
      ref={rootRef}
      className="fixed bottom-0 right-0 left-[var(--rail-w)] z-40 px-space-md sm:px-space-lg pb-5 pt-3 bg-gradient-to-t from-canvas-background via-canvas-background/95 to-transparent flex flex-col items-center md:left-[calc(var(--rail-w)+var(--sbw,280px))]"
    >
      <div className="w-full max-w-[768px] bg-surface-card rounded-2xl shadow-[0_12px_36px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.04)] p-3 transition-shadow duration-300 focus-within:shadow-[0_16px_40px_rgba(0,88,190,0.12)] border border-border-subtle">
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            id="prompt-input"
            variant="bare"
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            placeholder={
              isBusy
                ? 'Agent sedang menjawab…'
                : 'Ask me anything, explain algorithms, debug code...'
            }
            aria-label="Prompt input"
            title="Ketik pesan, Enter untuk kirim, Shift+Enter untuk baris baru"
            className="w-full resize-none leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 px-1">
          <SourcePicker value={source} onChange={onSourceChange} />

          <div className="flex items-center gap-2">
            <Button variant="tool" size="icon-sm" aria-label="Attach file or screenshot" title="Attach file or screenshot">
              <Paperclip className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="tool" size="icon-sm" aria-label="Voice dictation" title="Voice dictation">
              <Mic className="size-4" aria-hidden="true" />
            </Button>
            {isBusy ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop"
                className="h-8 rounded-full px-4 gap-1 font-semibold"
              >
                <span>Stop</span>
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onSend}
                disabled={isEmpty}
                aria-label="Send message"
                title="Send (Enter)"
                className="h-8 rounded-full px-4 gap-1 font-semibold"
              >
                <span>Send</span>
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-2.5">
        <p className="font-label-sm text-label-sm text-text-secondary">
          Orbita Study may display inaccurate info, so please double check
          responses.{' '}
          <a
            className="underline hover:text-secondary transition-colors"
            href="#privacy"
          >
            Your Privacy &amp; Orbita Study
          </a>
        </p>
      </div>
    </div>
  )
}
