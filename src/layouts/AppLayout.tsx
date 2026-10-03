import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useSidebarWidth } from '../hooks/useSidebarWidth'
import { useSidebarOffset } from '../hooks/useSidebarOffset'
import { usePageTransition } from '../hooks/usePageTransition'
import { IconRail } from '../components/rail/IconRail'
import { PageSkeleton, PageTransition, TopProgressBar } from '../components/feedback'
import { ChatSidebar } from '../components/sidebar/ChatSidebar'
import { FilesTopbar } from '../components/files/FilesTopbar'
import { Topbar } from '../components/topbar/Topbar'
import { Composer } from '../components/composer/Composer'
import { HomePage } from '../pages/HomePage'
import { useChat } from '../hooks/useChat'
import { createTutorSession } from '@/lib/coursesApi'
import type { FileDoc } from '../data/files'
import type { CourseItem } from '../data/courses'

const FilesPage = lazy(() =>
  import('../pages/FilesPage').then((m) => ({ default: m.FilesPage })),
)

const TasksPage = lazy(() =>
  import('../pages/TasksPage').then((m) => ({ default: m.TasksPage })),
)

const CoursesPage = lazy(() =>
  import('../pages/CoursesPage').then((m) => ({ default: m.CoursesPage })),
)

const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 768,
  )
  const [model, setModel] = useState('Orbita Study Plus')
  const [source, setSource] = useState('General Chat')
  // Matkul yang sedang dibuka dari halaman Courses. Dipakai FilesPage untuk
  // menyaring daftar berkas; null = tampilkan semua.
  const [filesCourseId, setFilesCourseId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [uploadSignal, setUploadSignal] = useState(0)
  const [newFolderSignal, setNewFolderSignal] = useState(0)
  const [filesTab, setFilesTab] = useState<'all' | 'recent' | 'shared' | 'trash'>('all')

  // Percakapan dengan agent. Sidebar dan area chat membaca dari state yang
  // sama, jadi daftar thread di sidebar selalu sama dengan yang sedang
  // ditampilkan. Riwayat persisten di SQLite backend (`thread.id` adalah
  // `session_id` backend) dan dimuat ulang saat aplikasi dibuka.
  const chat = useChat()
  const {
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
  } = chat

  const {
    width: sidebarWidth,
    dragging: sidebarDragging,
    nudge: nudgeSidebar,
    resetWidth: resetSidebarWidth,
    startResize: startSidebarResize,
  } = useSidebarWidth()

  const {
    displayRail,
    pending: pagePending,
    navigate: navigateTo,
  } = usePageTransition('chat-workspace')

  const isFiles = displayRail === 'documents-storage'
  const isTasks = displayRail === 'tasks-board'
  const isCourses = displayRail === 'courses-hub'
  const isSettings = displayRail === 'api-router'
  // Rail yang sidebar-nya dibawa oleh halaman (TasksPage/CoursesPage/SettingsPage
  // lewat FixedLayer). `analytics` tidak punya branch sehingga ikut Home.
  const isChat = !isFiles && !isTasks && !isCourses && !isSettings

  const sendDraft = () => {
    // Hanya kosongkan input kalau pesan benar-benar masuk dispatch.
    // Sebelumnya input selalu dikosongkan walau `send` early-return diam-diam
    // (activeThread yatim), sehingga terlihat "tidak ada pesan muncul".
    if (send(draft)) setDraft('')
  }

  const newChat = () => {
    newThread()
    setDraft('')
  }

  // Esc menutup drawer sidebar (hanya layout drawer / < md)
  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.matchMedia('(max-width: 767.98px)').matches) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  // `--sbw` ditulis ke :root (bukan div konten) supaya elemen fixed yang di-portal
  // lewat FixedLayer dan Composer tetap ikut mewarisi lebar sidebar yang sama,
  // dan ikut ter-animate bareng saat sidebar buka/tutup.
  useSidebarOffset(sidebarOpen, sidebarWidth)

  const insertPrompt = (text: string) => {
    setDraft(text)
    requestAnimationFrame(() => {
      document.getElementById('prompt-input')?.focus()
    })
  }

  const askFile = useCallback(
    (file: FileDoc) => {
      const isData = file.kind === 'csv' || file.kind === 'xlsx'
      navigateTo('chat-workspace')
      setSource('Course Materials')
      insertPrompt(
        `${isData ? 'Analyze' : 'Summarize'} "${file.name}" (${file.assistant.name}): `,
      )
    },
    [navigateTo],
  )
  const triggerUpload = useCallback(() => setUploadSignal((n) => n + 1), [])

  const consumeUploadSignal = useCallback(() => setUploadSignal(0), [])

  const triggerNewFolder = useCallback(() => setNewFolderSignal((n) => n + 1), [])

  const consumeNewFolderSignal = useCallback(() => setNewFolderSignal(0), [])

  const askTutor = useCallback(
    async (course: CourseItem) => {
      // Backend membuat sesi chat yang di-scope ke satu matkul
      // (`chat_sessions.offering_id` + `tutor_id`). Sesi itulah yang membuat
      // konteks RAG terisolasi — jangan pakai thread umum, ataubalasan tutor bisa
      // menarik materi matkul lain.
      let sessionId: string | null = null
      let opening = `Tanya "${course.tutor?.name ?? 'tutor'}" tentang "${course.title}" (${course.code}): `
      try {
        const session = await createTutorSession(course.id)
        sessionId = session.sessionId
        if (session.openingPrompt) opening = session.openingPrompt
        // Sesi baru dibuat backend, tapi daftar thread di state lokal belum
        // memuatnya. Tanpa refresh ini, `selectThread` tidak menemukan thread
        // dan `send` diam-diam tidak mengirim apa pun.
        await refreshThreads()
      } catch {
        // Backend mati atau matkul ini belum punya tutor: tetap buka chat,
        // hanya tanpa scope. Lebih baik daripada tombol mati.
      }
      if (sessionId) selectThread(sessionId)
      navigateTo('chat-workspace')
      setSource('Course Materials')
      insertPrompt(opening)
    },
    [navigateTo, refreshThreads, selectThread],
  )

  const openMaterial = useCallback(
    async (course: CourseItem) => {
      // Buka Files yang sudah difilter ke matkul ini. Filter dikirim lewat
      // state, bukan prompt, supaya daftar berkasnya benar-benar tersaring.
      setFilesCourseId(course.id)
      navigateTo('documents-storage')
      setSource('Course Materials')
    },
    [navigateTo],
  )

  /** Membuka thread dari sidebar; isi dimuat lazy dari backend. */
  const loadThread = (id: string) => {
    selectThread(id)
    setSidebarOpen((open) => (window.innerWidth < 768 ? false : open))
  }

  return (
    <div className="min-h-dvh bg-canvas-background text-on-surface font-body-md text-body-md">
      <TopProgressBar active={pagePending} />
      <IconRail
        activeId={displayRail}
        onSelect={navigateTo}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      {isChat ? (
        <ChatSidebar
          open={sidebarOpen}
          threads={threads}
          activeThreadId={activeThreadId}
          width={sidebarWidth}
          dragging={sidebarDragging}
          onResizeStart={startSidebarResize}
          onResizeNudge={nudgeSidebar}
          onResizeReset={resetSidebarWidth}
          onNewChat={newChat}
          onSelectThread={loadThread}
          onDeleteThread={deleteThread}
          onClearHistory={clearHistory}
          isLoadingHistory={isLoadingHistory}
          onClose={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="pl-[var(--rail-w)] md:pl-[calc(var(--rail-w)+var(--sbw,280px))]">
        <PageTransition pageKey={displayRail}>
          {isFiles ? (
          <>
            <FilesTopbar
              tab={filesTab}
              onTabChange={setFilesTab}
              onToggleSidebar={() => setSidebarOpen((open) => !open)}
              onUpload={triggerUpload}
              onNewFolder={triggerNewFolder}
            />
            <main className="relative min-h-screen w-full bg-canvas-background">
              <Suspense fallback={<PageSkeleton variant="files" />}>
              <FilesPage
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                sidebarDragging={sidebarDragging}
                onResizeStart={startSidebarResize}
                onResizeNudge={nudgeSidebar}
                onResizeReset={resetSidebarWidth}
                sidebarQuery={sidebarQuery}
                onSidebarQueryChange={setSidebarQuery}
                onUpload={triggerUpload}
                onCloseSidebar={() => setSidebarOpen(false)}
                tab={filesTab}
                onTabChange={setFilesTab}
                onAskFile={askFile}
                uploadSignal={uploadSignal}
                onConsumeUploadSignal={consumeUploadSignal}
                courseId={filesCourseId}
                onClearCourseFilter={() => setFilesCourseId(null)}
                newFolderSignal={newFolderSignal}
                onConsumeNewFolderSignal={consumeNewFolderSignal}
              />
              </Suspense>
            </main>
          </>
        ) : isTasks ? (
          <main className="relative min-h-screen w-full bg-canvas-background">
            <Suspense fallback={<PageSkeleton variant="tasks" />}>
              <TasksPage
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                sidebarDragging={sidebarDragging}
                onResizeStart={startSidebarResize}
                onResizeNudge={nudgeSidebar}
                onResizeReset={resetSidebarWidth}
                onToggleSidebar={() => setSidebarOpen((open) => !open)}
                onCloseSidebar={() => setSidebarOpen(false)}
              />
            </Suspense>
          </main>
        ) : isCourses ? (
          <main className="relative min-h-screen w-full bg-canvas-background">
            <Suspense fallback={<PageSkeleton variant="courses" />}>
              <CoursesPage
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                sidebarDragging={sidebarDragging}
                onResizeStart={startSidebarResize}
                onResizeNudge={nudgeSidebar}
                onResizeReset={resetSidebarWidth}
                onToggleSidebar={() => setSidebarOpen((open) => !open)}
                onCloseSidebar={() => setSidebarOpen(false)}
                onAskTutor={askTutor}
                onOpenMaterial={openMaterial}
              />
            </Suspense>
          </main>
        ) : isSettings ? (
          <main className="relative min-h-screen w-full bg-canvas-background">
            <Suspense fallback={<PageSkeleton variant="settings" />}>
              <SettingsPage
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                sidebarDragging={sidebarDragging}
                onResizeStart={startSidebarResize}
                onResizeNudge={nudgeSidebar}
                onResizeReset={resetSidebarWidth}
                onToggleSidebar={() => setSidebarOpen((open) => !open)}
                onCloseSidebar={() => setSidebarOpen(false)}
              />
            </Suspense>
          </main>
        ) : (
          <>
            <Topbar
              model={model}
              onSelectModel={setModel}
              onToggleSidebar={() => setSidebarOpen((open) => !open)}
              onNewChat={newChat}
            />
            {/* Tinggi tetap (100dvh dikurangi tinggi Topbar) + flex column
                supaya area pesan bisa menggulir sendiri, bukan ikut
                menggulir halaman. Tanpa pengurangan ini dokumen selalu lebih
                tinggi dari viewport karena Topbar berada di flow-nya, sehingga
                scrollbar halaman muncul. `dvh` mencegah address bar mobile
                memunculkan scrollbar lagi. `min-h-0` pada anak flex
                dibutuhkan agar child boleh menyusut lebih kecil dari
                kontennya. */}
            <main className="relative isolate h-[calc(100dvh-4rem)] bg-canvas-background w-full flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 w-full">
                <div className="relative w-full h-full max-w-[1040px] mx-auto px-space-md sm:px-space-lg lg:px-space-xl pt-4 flex flex-col overflow-hidden">
                  {/* Ambient radial glow backdrop */}
                  <div
                    aria-hidden="true"
                    className="absolute top-6 left-1/2 -translate-x-1/2 w-[520px] h-[340px] bg-gradient-to-tr from-secondary/15 via-secondary-container/10 to-transparent blur-3xl pointer-events-none rounded-full -z-10"
                  />
                  <HomePage
                    messages={messages}
                    isBusy={isBusy}
                    onRetry={retry}
                    onStop={stop}
                    onQuickAction={insertPrompt}
                    onTryPrompt={() =>
                      insertPrompt(
                        'What is the difference between BFS and DFS that I should highlight for my Algorithms exam?',
                      )
                    }
                    onLaunch={() => insertPrompt('Start a study session with Raka.')}
                  />
                </div>
              </div>
            </main>
          </>
        )}
        </PageTransition>
      </div>

      {isChat && (
        <Composer
          value={draft}
          source={source}
          onChange={setDraft}
          onSourceChange={setSource}
          onSend={sendDraft}
          isBusy={isBusy}
          onStop={stop}
        />
      )}
    </div>
  )
}
