import { GreetingHeader, QuickActions } from '@/components/home/GreetingHeader'
import { FeaturedAssistantCard } from '@/components/cards/FeaturedAssistantCard'
import { TasksCard } from '@/components/cards/TasksCard'
import { SuggestedPromptCard } from '@/components/cards/SuggestedPromptCard'
import { WorkspaceContextBar } from '@/components/workspace/WorkspaceContextBar'
import { MessageList } from '@/components/chat/MessageList'
import { FixedLayer } from '@/components/feedback/FixedLayer'
import { Modal, ModalTrigger, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { useEffect, useState } from 'react'
import type { ChatMessage } from '@/hooks/useChat'
import { fetchMaterials, isCoursesAbort } from '@/lib/coursesApi'

type HomePageProps = {
  messages: ChatMessage[]
  isBusy: boolean
  onRetry: () => void
  onStop: () => void
  onQuickAction: (label: string) => void
  onTryPrompt: () => void
  onLaunch: () => void
}

/** Isi landing yang muncul sebelum ada percakapan. */
function Landing({
  onQuickAction,
  onTryPrompt,
  onLaunch,
}: Pick<HomePageProps, 'onQuickAction' | 'onTryPrompt' | 'onLaunch'>) {
  /**
   * Konteks workspace dari backend. `limit: 1` supaya ringan — yang dipakai
   * hanya `stats` (agregat penuh, tidak terpengaruh limit) + judul matkul
   * materi terbaru. `undefined` = belum terjawab → bar menampilkan placeholder.
   * Gagal fetch tidak menampilkan error di landing; bar tetap netral.
   */
  const [ctxName, setCtxName] = useState<string | null | undefined>(undefined)
  const [ctxReady, setCtxReady] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const latest = await fetchMaterials(
          { tab: 'all', kind: 'all', q: '', sort: 'recent', limit: 1 },
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        setCtxName(latest.items[0]?.courseTitle ?? null)
        setCtxReady(latest.stats.indexed)
      } catch (e) {
        if (isCoursesAbort(e) || controller.signal.aborted) return
        setCtxName(null)
        setCtxReady(0)
      }
    })()
    return () => controller.abort()
  }, [])

  return (
    <>
      <GreetingHeader />
      <QuickActions onAction={onQuickAction} />

      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5 mb-10 items-stretch">
        <FeaturedAssistantCard onLaunch={onLaunch} />
        <TasksCard />
        <SuggestedPromptCard onTryPrompt={onTryPrompt} />
      </div>

      <WorkspaceContextBar contextName={ctxName} readyCount={ctxReady} />
    </>
  )
}

export function HomePage({
  messages,
  isBusy,
  onRetry,
  onStop,
  onQuickAction,
  onTryPrompt,
  onLaunch,
}: HomePageProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const hasConversation = messages.length > 0

  return (
    <>
      {hasConversation ? (
        // Daftar pesan mengisi tinggi yang tersisa dan menggulir sendiri.
        // Padding bawah memakai `--composer-h` karena Composer menempel
        // di layar dan tingginya berubah mengikuti isi textarea.
        <div className="flex-1 min-h-0 flex flex-col pb-[var(--composer-h,206px)]">
          <MessageList
            messages={messages}
            onRetry={onRetry}
            onStop={onStop}
            isBusy={isBusy}
          />
        </div>
      ) : (
        // Landing digulir sebagai satu halaman utuh, dengan ruang untuk
        // Composer di bawah.
        <div className="scrollbar-none flex-1 min-h-0 overflow-y-auto pb-[var(--composer-h,206px)]">
          <div className="flex flex-col items-center">
            <Landing
              onQuickAction={onQuickAction}
              onTryPrompt={onTryPrompt}
              onLaunch={onLaunch}
            />
          </div>
        </div>
      )}
      {/* Modal Demo — demonstrates shadcn/ui Dialog */}
      <FixedLayer>
        <div className="fixed bottom-4 right-4 z-50 md:bottom-8 md:right-8">
          <Modal open={modalOpen} onOpenChange={setModalOpen}>
            <ModalTrigger asChild>
              <Button className="rounded-full shadow-lg hover:shadow-xl transition-shadow">
                New Conversation
              </Button>
            </ModalTrigger>
            <ModalContent className="w-full max-w-md">
              <ModalHeader>
                <ModalTitle>Start a New Conversation</ModalTitle>
                <ModalDescription>
                  Begin a fresh chat session with your AI assistant.
                </ModalDescription>
              </ModalHeader>
              <Form>
                <FormField name="topic">
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Product Strategy" />
                    </FormControl>
                    <FormDescription>
                      What would you like to discuss?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                </FormField>
                <FormField name="details">
                  <FormItem className="mt-4">
                    <FormLabel>Details</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Provide more context..." className="min-h-[80px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </FormField>
              </Form>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>
                  Start Session
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </div>
      </FixedLayer>
    </>
  )
}
