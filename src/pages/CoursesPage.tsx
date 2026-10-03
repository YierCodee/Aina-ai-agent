import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import {
  draftFromCard,
  emptyDraft,
  sanitizeWeeks,
  type CourseDraft,
  type CourseItem,
  type CoursesSort,
  type CoursesTab,
  type CourseQuickViewId,
} from '@/data/courses'
import {
  createCourse,
  CoursesApiError,
  dropCourse,
  isCoursesAbort,
  updateCourse,
} from '@/lib/coursesApi'
import { useCourses } from '@/hooks/useCourses'
import { CoursesSidebar } from '@/components/courses/CoursesSidebar'
import { CoursesTopbar } from '@/components/courses/CoursesTopbar'
import { FixedLayer } from '@/components/feedback/FixedLayer'
import { PageSkeleton } from '@/components/feedback/PageSkeleton'
import { CoursesMetrics } from '@/components/courses/CoursesMetrics'
import { CoursesFilterBar } from '@/components/courses/CoursesFilterBar'
import { CourseCard, CourseGroup } from '@/components/courses/CourseCard'
import { CourseFormDialog } from '@/components/courses/CourseFormDialog'
import { CourseDeleteDialog } from '@/components/courses/CourseDeleteDialog'
import { TermManagerDialog } from '@/components/courses/TermManagerDialog'
import { CopilotBanner } from '@/components/tasks/CopilotBanner'
import { Button } from '@/components/ui/button'
import { listTerms, type TermItem } from '@/lib/coursesApi'

type Props = {
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarDragging: boolean
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  onToggleSidebar: () => void
  onCloseSidebar: () => void
  onAskTutor: (course: CourseItem) => void
  onOpenMaterial: (course: CourseItem) => void
}

export function CoursesPage({
  sidebarOpen,
  sidebarWidth,
  sidebarDragging,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  onToggleSidebar,
  onCloseSidebar,
  onAskTutor,
  onOpenMaterial,
}: Props) {
  const [query, setQuery] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [tab, setTab] = useState<CoursesTab>('all')
  const [activeQuick, setActiveQuick] = useState<CourseQuickViewId>('all')
  const [sort, setSort] = useState<CoursesSort>('progress')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // State CRUD. `editing: null` + `creating: false` = tidak ada dialog terbuka.
  // Dua state terpisah (bukan satu `mode`) supaya dari mode create ke edit
  // tidak pernah bisa terjadi di render yang sama.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CourseItem | null>(null)
  const [dropping, setDropping] = useState<CourseItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  /** Id matkul yang sedang ditulis — dipakai untuk menonaktifkan menu kartunya. */
  const [pendingId, setPendingId] = useState<string | null>(null)

  // State dialog kelola semester. `termMode: 'create'` membuka dialog langsung
  // ke form buat — dipakai banner empty-state dan CTA error di modal enroll.
  const [terms, setTerms] = useState<TermItem[]>([])
  const [termDialogOpen, setTermDialogOpen] = useState(false)
  const [termMode, setTermMode] = useState<'manage' | 'create'>('manage')
  const [termError, setTermError] = useState<string | null>(null)

  // Filter, pencarian, dan sort terjadi di SQL. Hook mengembalikan hasil yang
  // sudah difilter, beserta counts dan metrics dari agregat database.
  const { items, counts, metrics, termLabel, loading, error, refetch } = useCourses({
    query,
    sidebarQuery,
    tab,
    quickView: activeQuick,
    sort,
  })

  const flash = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const cycleSort = () =>
    setSort((s) => (s === 'progress' ? 'name' : s === 'name' ? 'sks' : 'progress'))

  const handleSelectQuick = (id: CourseQuickViewId) => {
    setActiveQuick(id)
    setTab(id === 'teori' ? 'teori' : id === 'praktikum' ? 'praktikum' : 'all')
  }

  const handleTabChange = (t: CoursesTab) => {
    setTab(t)
    setActiveQuick(t === 'teori' ? 'teori' : t === 'praktikum' ? 'praktikum' : 'all')
  }

  const focusSearch = () => document.getElementById('course-search')?.focus()

  // ---------------------------------------------------------------------
  // Kelola semester
  //
  // `termLabel === ''` (setelah load) berarti tidak ada semester aktif —
  // kondisi yang bikin enroll gagal 409. Banner + dialog di bawah memberi
  // jalan keluar tanpa menunggu user membentur error itu.
  // ---------------------------------------------------------------------
  const openTermDialog = (mode: 'manage' | 'create') => {
    setTermMode(mode)
    setTermError(null)
    setTermDialogOpen(true)
  }

  const refreshTerms = async () => {
    try {
      const data = await listTerms()
      setTerms(data.items)
    } catch {
      // Gagal memuat daftar tidak menutup dialog; form create tetap bisa dipakai.
    }
  }

  const handleTermChanged = () => {
    void refreshTerms()
    refetch()
  }

  const closeTermDialog = () => {
    setTermDialogOpen(false)
    setTermError(null)
  }

  // ---------------------------------------------------------------------
  // CRUD
  //
  // Setiap write ditutup `refetch()`. Tidak ada state optimistis di sini:
  // sumber kebenaran ada di database, dan setiap write mengubah aggregate
  // (counts, metrics) yang tidak bisa dihitung lokal tanpa meniru query SQL.
  // ---------------------------------------------------------------------
  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setFormError(null)
  }

  const openEdit = (course: CourseItem) => {
    setCreating(false)
    setEditing(course)
    setFormError(null)
  }

  const closeForm = () => {
    if (saving) return
    setCreating(false)
    setEditing(null)
    setFormError(null)
  }

  const openDrop = (course: CourseItem) => {
    setDropping(course)
    setDropError(null)
  }

  const closeDrop = () => {
    if (saving) return
    setDropping(null)
    setDropError(null)
  }

  /** Draft form -> badan request. weeks disaring dulu (nomor & judul valid). */
  const toBody = (draft: CourseDraft) => {
    const weeks = sanitizeWeeks(draft.weeks)
    return {
      code: draft.code.trim(),
      title: draft.title.trim(),
      kind: draft.kind,
      sks: draft.sks,
      focus: draft.focus.trim() || null,
      classLabel: draft.classLabel.trim(),
      room: draft.room.trim() || null,
      lecturer: {
        name: draft.lecturer.name.trim(),
        email: draft.lecturer.email.trim() || null,
        avatarTone: draft.lecturer.tone,
      },
      tutor: draft.tutor
        ? {
            name: draft.tutor.name.trim(),
            description: draft.tutor.description.trim(),
            emoji: draft.tutor.emoji.trim() || '\u{1F916}',
          }
        : null,
      progressPercent: draft.progressPercent,
      currentWeek: draft.currentWeek,
      featured: draft.featured,
      ...(weeks.length > 0 ? { weeks } : {}),
    }
  }

  const submitForm = async (draft: CourseDraft) => {
    if (saving) return
    setSaving(true)
    setFormError(null)
    const target = editing
    try {
      if (target) await updateCourse(target.id, toBody(draft))
      else await createCourse(toBody(draft))
      setCreating(false)
      setEditing(null)
      refetch()
      flash(
        target
          ? `${draft.title.trim()} diperbarui.`
          : `${draft.title.trim()} didaftarkan ke semester ini.`,
      )
    } catch (e) {
      if (isCoursesAbort(e)) return
      // Error dari backend sudah berbahasa manusia (409/422); cukup tampilkan.
      setFormError(e instanceof CoursesApiError ? e.message : 'Gagal menyimpan matkul.')
    } finally {
      setSaving(false)
    }
  }

  const toggleFeatured = async (course: CourseItem) => {
    if (pendingId) return
    setPendingId(course.id)
    try {
      await updateCourse(course.id, { featured: !course.featured })
      refetch()
      flash(
        course.featured
          ? `${course.title} dikeluarkan dari unggulan.`
          : `${course.title} ditandai unggulan.`,
      )
    } catch (e) {
      flash(e instanceof CoursesApiError ? e.message : 'Gagal menandai unggulan.')
    } finally {
      setPendingId(null)
    }
  }

  const confirmDrop = async () => {
    if (saving || !dropping) return
    setSaving(true)
    setDropError(null)
    try {
      await dropCourse(dropping.id)
      setDropping(null)
      refetch()
      flash(`${dropping.title} dilepas dari semester.`)
    } catch (e) {
      if (isCoursesAbort(e)) return
      setDropError(e instanceof CoursesApiError ? e.message : 'Gagal melepas matkul.')
    } finally {
      setSaving(false)
    }
  }

  // Pengelompokan tetap di client karena hanya untuk merender dua section;
  // urutan di dalam tiap group sudah dipastikan oleh query server.
  const teori = items.filter((c) => c.kind === 'teori')
  const praktikum = items.filter((c) => c.kind === 'praktikum')

  const emptyMessage = 'Tidak ada matkul yang cocok dengan filter saat ini.'

  return (
    <>
      <FixedLayer>
        <CoursesSidebar
          open={sidebarOpen}
          width={sidebarWidth}
          dragging={sidebarDragging}
          query={sidebarQuery}
          onQueryChange={setSidebarQuery}
          onNewCourse={openCreate}
          activeQuick={activeQuick}
          onSelectQuick={handleSelectQuick}
          counts={counts}
          metrics={metrics}
          onResizeStart={onResizeStart}
          onResizeNudge={onResizeNudge}
          onResizeReset={onResizeReset}
          onClose={onCloseSidebar}
        />
      </FixedLayer>

      <CoursesTopbar
        onAddCourse={openCreate}
        onToggleSidebar={onToggleSidebar}
        onFilterClick={focusSearch}
        onSortCycle={cycleSort}
        count={metrics?.totalCourses ?? 0}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 pb-24 sm:px-6">
        {loading ? (
          <PageSkeleton variant="courses" />
        ) : error ? (
          <section
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl bg-surface-card p-8 shadow-sm"
          >
            <span className="flex items-center gap-2 text-error">
              <TriangleAlert className="size-5" aria-hidden="true" />
              <span className="font-headline-sm text-headline-sm font-semibold">
                Data matkul tidak bisa dimuat
              </span>
            </span>
            <p className="max-w-xl font-body-sm text-body-sm text-text-secondary">
              {error}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={refetch}>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Coba lagi</span>
              </Button>
            </div>
          </section>
        ) : (
          <>
            {termLabel === '' && (
              <section
                role="alert"
                className="flex flex-col items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-sm"
              >
                <span className="flex items-center gap-2 text-text-primary">
                  <TriangleAlert className="size-5 text-secondary" aria-hidden="true" />
                  <span className="font-headline-sm text-headline-sm font-semibold">
                    Belum ada semester aktif
                  </span>
                </span>
                <p className="max-w-xl font-body-sm text-body-sm text-text-secondary">
                  Matkul tidak bisa didaftarkan sebelum ada semester aktif. Buat
                  semester dulu lewat dialog kelola semester.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openTermDialog('create')}
                  >
                    Buat semester
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openTermDialog('manage')}
                  >
                    Kelola semester
                  </Button>
                </div>
              </section>
            )}
            <CoursesMetrics
              metrics={metrics}
              termLabel={termLabel}
              onManageTerms={() => openTermDialog('manage')}
            />
            <CoursesFilterBar
              query={query}
              onQueryChange={setQuery}
              tab={tab}
              onTabChange={handleTabChange}
              sort={sort}
              onSortCycle={cycleSort}
              searchId="course-search"
            />

            <div className="flex flex-col gap-8">
              <CourseGroup
                title="Matkul Teori"
                dot="bg-secondary"
                count={teori.length}
                actionLabel="Lihat silabus"
              >
                {teori.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    onAskTutor={onAskTutor}
                    onOpenMaterial={onOpenMaterial}
                    onEdit={openEdit}
                    onToggleFeatured={toggleFeatured}
                    onDrop={openDrop}
                    busy={pendingId === c.id}
                  />
                ))}
                {teori.length === 0 && items.length > 0 && (
                  <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary lg:col-span-2">
                    Tidak ada matkul teori yang cocok dengan filter saat ini.
                  </p>
                )}
              </CourseGroup>

              <CourseGroup
                title="Praktikum"
                dot="bg-success-emerald"
                count={praktikum.length}
                actionLabel="Lihat jadwal lab"
              >
                {praktikum.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    onAskTutor={onAskTutor}
                    onOpenMaterial={onOpenMaterial}
                    onEdit={openEdit}
                    onToggleFeatured={toggleFeatured}
                    onDrop={openDrop}
                    busy={pendingId === c.id}
                  />
                ))}
                {praktikum.length === 0 && items.length > 0 && (
                  <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary lg:col-span-2">
                    Tidak ada praktikum yang cocok dengan filter saat ini.
                  </p>
                )}
              </CourseGroup>

              {items.length === 0 && (
                <p className="rounded-2xl bg-surface-card p-8 text-center font-body-sm text-body-sm text-text-secondary">
                  {emptyMessage}
                </p>
              )}

              <CopilotBanner
                onOptimize={() =>
                  flash(`Orbita menyusun jadwal belajar ${metrics?.totalCourses ?? 0} matkul…`)
                }
                onSettings={() => flash('Pengaturan tutor matkul dibuka.')}
              />
            </div>
          </>
        )}
      </div>

      {/*
        Dialog di-portal sendiri oleh Radix, jadi tidak terkena masalah
        `filter: blur()` di `PageTransition` yang membuat `position: fixed`
        meleset. Keduanya berada DI LUAR blok `error` supaya tetap bisa dibuka
        untuk mencoba memperbaiki data yang gagal dimuat.
      */}
      <CourseFormDialog
        key={editing?.id ?? 'create'}
        open={creating || editing !== null}
        course={editing}
        initial={editing ? draftFromCard(editing) : emptyDraft()}
        busy={saving}
        error={formError}
        onClose={closeForm}
        onSubmit={submitForm}
        onManageTerms={() => openTermDialog('create')}
      />
      <CourseDeleteDialog
        open={dropping !== null}
        course={dropping}
        busy={saving}
        error={dropError}
        onClose={closeDrop}
        onConfirm={confirmDrop}
      />
      <TermManagerDialog
        open={termDialogOpen}
        initialMode={termMode}
        terms={terms}
        busy={false}
        error={termError}
        onClose={closeTermDialog}
        onChanged={handleTermChanged}
      />

      {toast && (
        <FixedLayer>
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-text-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-lg"
          >
            {toast}
          </div>
        </FixedLayer>
      )}
    </>
  )
}
