import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  createFolder,
  deleteFolder,
  deleteMaterial,
  fetchFolders,
  fetchMaterials,
  isCoursesAbort,
  moveMaterial,
  renameMaterial,
  updateFolder,
  uploadMaterials,
  type MaterialStats,
} from '@/lib/coursesApi'
import {
  filesSortLabel,
  PAGE_SIZE,
  type FileDoc,
  type FileFolder,
  type FilesSort,
  type FilesTab,
  type FilesView,
  type TypeFilter,
} from '@/data/files'
import { DeleteConfirmDialog } from '@/components/files/DeleteConfirmDialog'
import { DocumentsSidebar } from '@/components/files/DocumentsSidebar'
import { FilesHeader } from '@/components/files/FilesHeader'
import { FolderDetailView } from '@/components/files/FolderDetailView'
import { RenameDialog, type RenameIcon } from '@/components/files/RenameDialog'
import { NewFolderDialog, type NewFolderBody } from '@/components/files/NewFolderDialog'
import { StatsBento } from '@/components/files/StatsBento'
import { PinnedFolders } from '@/components/files/PinnedFolders'
import { FilesTable } from '@/components/files/FilesTable'
import { Dropzone } from '@/components/files/Dropzone'
import { ContextStatusBar } from '@/components/files/ContextStatusBar'
import { FixedLayer } from '@/components/feedback/FixedLayer'
import { Button } from '@/components/ui/button'

type Props = {
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarDragging: boolean
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void
  onResizeNudge: (delta: number) => void
  onResizeReset: () => void
  sidebarQuery: string
  onSidebarQueryChange: (q: string) => void
  onUpload: () => void
  onCloseSidebar: () => void
  tab: FilesTab
  onTabChange: (t: FilesTab) => void
  onAskFile: (file: FileDoc) => void
  uploadSignal: number
  onConsumeUploadSignal: () => void
  /** Filter ke satu matkul. null = semua berkas. */
  courseId: string | null
  onClearCourseFilter: () => void
  /** Sinyal dari topbar untuk membuka dialog folder baru (pola uploadSignal). */
  newFolderSignal: number
  onConsumeNewFolderSignal: () => void
}

const DEBOUNCE_MS = 220
/** Jumlah baris di section "File Terbaru" tampilan utama. */
const RECENT_LIMIT = 8

export function FilesPage({
  sidebarOpen,
  sidebarWidth,
  sidebarDragging,
  onResizeStart,
  onResizeNudge,
  onResizeReset,
  sidebarQuery,
  onSidebarQueryChange,
  onUpload,
  onCloseSidebar,
  tab,
  onTabChange,
  onAskFile,
  uploadSignal,
  onConsumeUploadSignal,
  courseId,
  onClearCourseFilter,
  newFolderSignal,
  onConsumeNewFolderSignal,
}: Props) {
  const [docs, setDocs] = useState<FileDoc[]>([])
  const [folders, setFolders] = useState<FileFolder[]>([])
  const [total, setTotal] = useState(0)
  /** null = backend belum menjawab → anak (StatsBento) render skeleton. */
  const [stats, setStats] = useState<MaterialStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sort, setSort] = useState<FilesSort>('recent')
  const [view, setView] = useState<FilesView>('list')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  /**
   * Folder yang sedang dibuka sebagai halaman. null = tampilan utama
   * (folder cards + File Terbaru). Menggantikan filter chip: "masuk" ke
   * folder, bukan menyaring tabel di tempat.
   */
  const [activeFolder, setActiveFolder] = useState<FileFolder | null>(null)
  /** Tampilan utama: false = 8 terbaru ringkas, true = tabel penuh. */
  const [showAll, setShowAll] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  // Rename: satu dialog untuk berkas & folder.
  const [renameTarget, setRenameTarget] = useState<
    | { kind: 'file'; id: string; name: string }
    | { kind: 'folder'; id: string; name: string; icon: FileFolder['icon'] }
    | null
  >(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  // Hapus permanen: daftar id berkas, atau satu folder.
  const [filesToDelete, setFilesToDelete] = useState<string[] | null>(null)
  const [folderToDelete, setFolderToDelete] = useState<FileFolder | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<number | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  // Tombol Upload dari sidebar/topbar/header memicu input tersembunyi yang sama.
  useEffect(() => {
    if (uploadSignal > 0) {
      inputRef.current?.click()
      onConsumeUploadSignal()
    }
  }, [uploadSignal, onConsumeUploadSignal])

  // Tombol New Folder dari topbar membuka dialog (pola yang sama).
  useEffect(() => {
    if (newFolderSignal > 0) {
      setFolderError(null)
      setFolderDialogOpen(true)
      onConsumeNewFolderSignal()
    }
  }, [newFolderSignal, onConsumeNewFolderSignal])

  // Daftar file + folder dari backend. Query, jenis, tab, sort, dan filter
  // matkul semuanya diteruskan ke SQL; yang tersisa di client hanya paginasi
  // tampilan dan seleksi baris.
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setError(null)
      void (async () => {
        try {
          const [materials, fileFolders] = await Promise.all([
            fetchMaterials(
              {
                tab,
                kind: typeFilter,
                q: query,
                courseId,
                folderId: activeFolder?.id ?? null,
                sort,
                limit: 200,
              },
              { signal: controller.signal },
            ),
            fetchFolders({ signal: controller.signal }),
          ])
          if (controller.signal.aborted) return
          setDocs(materials.items)
          setTotal(materials.total)
          setStats(materials.stats)
          setFolders(fileFolders)
        } catch (e) {
          if (isCoursesAbort(e)) return
          setError(e instanceof Error ? e.message : 'Gagal memuat berkas.')
          setDocs([])
          setFolders([])
          setTotal(0)
          setStats(null)
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [tab, typeFilter, query, courseId, activeFolder?.id, sort, nonce])


  // Judul matkul untuk label chip filter. Diturunkan saat render dari data yang
  // sudah dimuat, bukan disimpan di state: nilai ini 100% fungsi dari
  // `courseId` + `docs`, jadi menaruhnya di state hanya menambah render kedua.
  const courseTitle = useMemo(() => {
    if (!courseId) return null
    return docs.find((doc) => doc.courseId === courseId)?.courseTitle ?? courseId
  }, [courseId, docs])

  // Search sidebar ikut memfilter konten utama. Sengaja client-side supaya tidak
  // menambah request: `sidebarQuery` mengubah cepat, dan daftar yang sudah
  // dimuat cukup untuk penyaringan ringan.
  const visible = useMemo(() => {
    const sq = sidebarQuery.trim().toLowerCase()
    if (!sq) return docs
    return docs.filter((doc) =>
      `${doc.name} ${doc.sub} ${doc.assistant.name}`.toLowerCase().includes(sq),
    )
  }, [docs, sidebarQuery])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visible, safePage],
  )

  /** Reset pagination + seleksi saat filter berubah — dipanggil dari handler. */
  const resetPagination = () => {
    setPage(1)
    setSelected(new Set())
    setShowAll(false)
  }

  // Filter yang datang lewat props (tab, sidebarQuery) tidak punya handler
  // lokal: sesuaikan pagination saat render (derived-state React, tanpa effect).
  const filterKey = `${tab}|${sidebarQuery}|${courseId ?? ''}|${activeFolder?.id ?? ''}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    if (page !== 1) setPage(1)
    if (selected.size > 0) setSelected(new Set())
    if (showAll) setShowAll(false)
  }

  // Daftar yang tampil di tabel utama: 8 terbaru ringkas, atau halaman penuh
  // saat "Lihat semua". `visible` sudah urut sort server (default recent).
  const recent = useMemo(() => visible.slice(0, RECENT_LIMIT), [visible])
  const displayed = showAll ? paged : recent

  const allSelected = displayed.length > 0 && displayed.every((f) => selected.has(f.id))

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) displayed.forEach((f) => next.delete(f.id))
      else displayed.forEach((f) => next.add(f.id))
      return next
    })

  const cycleSort = () => {
    resetPagination()
    setSort((s) => (s === 'recent' ? 'name' : s === 'name' ? 'size' : 'recent'))
  }

  const handleQueryChange = (q: string) => {
    resetPagination()
    setQuery(q)
  }

  const handleTypeChange = (t: TypeFilter) => {
    resetPagination()
    setTypeFilter(t)
  }

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return
    void (async () => {
      try {
        // Upload bytes ke backend; ingest (parse/split/embed) jalan sebagai
        // BackgroundTasks. Polling sampai semua selesai indexed/error.
        const created = await uploadMaterials(files.slice(0, 20), {
          courseId,
          folderId: activeFolder?.id ?? null,
        })
        if (created.length === 0) return
        onTabChange('all')
        setTypeFilter('all')
        setQuery('')
        setPage(1)
        setNonce((n) => n + 1)
        flash(`${created.length} document(s) queued for study indexing.`)
        const pending = new Set(created.map((doc) => doc.id))
        for (let attempt = 0; attempt < 20 && pending.size > 0; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500))
          try {
            const latest = await fetchMaterials({
              tab: 'all',
              kind: 'all',
              q: '',
              courseId,
              folderId: activeFolder?.id ?? null,
              sort,
              limit: 200,
            })
            setDocs(latest.items)
            setTotal(latest.total)
            setStats(latest.stats)
            for (const doc of latest.items) {
              if (
                pending.has(doc.id) &&
                doc.status !== 'queued' &&
                doc.status !== 'indexing'
              ) {
                pending.delete(doc.id)
              }
            }
            setNonce((n) => n + 1)
          } catch {
            break
          }
        }
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Gagal mengunggah berkas.')
      }
    })()
  }

  // ---------------------------------------------------------------------
  // Folder: buat + pindah. Setiap write ditutup refetch (nonce), sama seperti
  // pola CRUD di CoursesPage — angka count/size kartu dihitung server.
  // ---------------------------------------------------------------------
  const openNewFolder = () => {
    setFolderError(null)
    setFolderDialogOpen(true)
  }

  const closeNewFolder = () => {
    if (folderBusy) return
    setFolderDialogOpen(false)
    setFolderError(null)
  }

  const submitNewFolder = (body: NewFolderBody) => {
    if (folderBusy) return
    setFolderBusy(true)
    setFolderError(null)
    void (async () => {
      try {
        const created = await createFolder({
          name: body.name,
          icon: body.icon,
          courseId: body.courseId,
        })
        setFolderDialogOpen(false)
        setNonce((n) => n + 1)
        flash(`Folder "${created.name}" dibuat.`)
      } catch (e) {
        if (isCoursesAbort(e)) return
        // Pesan 409 dari backend ("sudah ada") sudah berbahasa manusia.
        setFolderError(e instanceof Error ? e.message : 'Gagal membuat folder.')
      } finally {
        setFolderBusy(false)
      }
    })()
  }

  const handleMove = (ids: string[], targetId: string | null) => {
    if (moving || ids.length === 0) return
    setMoving(true)
    void (async () => {
      try {
        await Promise.all(ids.map((id) => moveMaterial(id, targetId)))
        setSelected(new Set())
        setNonce((n) => n + 1)
        flash(
          targetId
            ? `${ids.length} berkas dipindahkan.`
            : `${ids.length} berkas dikeluarkan dari folder.`,
        )
      } catch (e) {
        if (isCoursesAbort(e)) return
        flash(e instanceof Error ? e.message : 'Gagal memindahkan berkas.')
      } finally {
        setMoving(false)
      }
    })()
  }

  const openFolder = (folder: FileFolder) => {
    setActiveFolder(folder)
    resetPagination()
  }

  const closeFolder = () => {
    setActiveFolder(null)
    resetPagination()
  }

  // ---------------------------------------------------------------------
  // Rename berkas & folder — satu dialog, satu write + refetch.
  // ---------------------------------------------------------------------
  const openRenameFile = (file: FileDoc) => {
    setRenameError(null)
    setRenameTarget({ kind: 'file', id: file.id, name: file.name })
  }

  const openRenameFolder = (folder: FileFolder) => {
    setRenameError(null)
    setRenameTarget({ kind: 'folder', id: folder.id, name: folder.name, icon: folder.icon })
  }

  const closeRename = () => {
    if (renameBusy) return
    setRenameTarget(null)
    setRenameError(null)
  }

  const submitRename = (name: string, icon: RenameIcon | null) => {
    if (!renameTarget || renameBusy) return
    const target = renameTarget
    setRenameBusy(true)
    setRenameError(null)
    void (async () => {
      try {
        if (target.kind === 'file') {
          await renameMaterial(target.id, name)
        } else {
          await updateFolder(target.id, { name, ...(icon ? { icon } : {}) })
          // Sinkronkan header halaman folder yang sedang dibuka — refetch
          // daftar (nonce) menyusul, tapi breadcrumb tidak boleh basi.
          setActiveFolder((prev) =>
            prev && prev.id === target.id ? { ...prev, name, ...(icon ? { icon } : {}) } : prev,
          )
        }
        setRenameTarget(null)
        setNonce((n) => n + 1)
        flash(`"${name}" diperbarui.`)
      } catch (e) {
        if (isCoursesAbort(e)) return
        setRenameError(e instanceof Error ? e.message : 'Gagal menyimpan nama.')
      } finally {
        setRenameBusy(false)
      }
    })()
  }

  // ---------------------------------------------------------------------
  // Hapus permanen. Berkas: baris + chunks + byte disk. Folder: folder hilang,
  // isi jadi file lepas. Dua-duanya butuh konfirmasi eksplisit.
  // ---------------------------------------------------------------------
  const askDeleteFiles = (ids: string[]) => {
    if (ids.length === 0) return
    setDeleteError(null)
    setFilesToDelete(ids)
  }

  const askDeleteFolder = (folder: FileFolder) => {
    setDeleteError(null)
    setFolderToDelete(folder)
  }

  const closeDelete = () => {
    if (deleting) return
    setFilesToDelete(null)
    setFolderToDelete(null)
    setDeleteError(null)
  }

  /** Jumlah file di folder target hapus (untuk teks konfirmasi). */
  const folderDeleteCount = (folder: FileFolder): number => {
    if (activeFolder?.id === folder.id) return total
    const n = Number.parseInt(folder.count, 10)
    return Number.isFinite(n) ? n : 0
  }

  const confirmDeleteFiles = () => {
    if (!filesToDelete || deleting) return
    const ids = filesToDelete
    setDeleting(true)
    setDeleteError(null)
    void (async () => {
      try {
        await Promise.all(ids.map((id) => deleteMaterial(id)))
        setFilesToDelete(null)
        setSelected(new Set())
        setNonce((n) => n + 1)
        flash(ids.length === 1 ? '1 berkas dihapus permanen.' : `${ids.length} berkas dihapus permanen.`)
      } catch (e) {
        if (isCoursesAbort(e)) return
        setDeleteError(e instanceof Error ? e.message : 'Gagal menghapus berkas.')
      } finally {
        setDeleting(false)
      }
    })()
  }

  const confirmDeleteFolder = () => {
    if (!folderToDelete || deleting) return
    const folder = folderToDelete
    setDeleting(true)
    setDeleteError(null)
    void (async () => {
      try {
        const res = await deleteFolder(folder.id)
        if (activeFolder?.id === folder.id) setActiveFolder(null)
        setFolderToDelete(null)
        setNonce((n) => n + 1)
        flash(
          res.released > 0
            ? `Folder dihapus; ${res.released} berkas jadi lepas.`
            : 'Folder dihapus.',
        )
      } catch (e) {
        if (isCoursesAbort(e)) return
        setDeleteError(e instanceof Error ? e.message : 'Gagal menghapus folder.')
      } finally {
        setDeleting(false)
      }
    })()
  }

  /** Nama berkas target hapus, untuk teks konfirmasi (maks 3 + sisa). */
  const deleteFileNames = (ids: string[]): string[] =>
    ids.map((id) => docs.find((d) => d.id === id)?.name ?? id)

  return (
    <>
      <FixedLayer>
        <DocumentsSidebar
          open={sidebarOpen}
          width={sidebarWidth}
          dragging={sidebarDragging}
          query={sidebarQuery}
          onQueryChange={onSidebarQueryChange}
          onUpload={onUpload}
          onResizeStart={onResizeStart}
          onResizeNudge={onResizeNudge}
          onResizeReset={onResizeReset}
          onClose={onCloseSidebar}
          hasData={total > 0 || folders.length > 0}
          storageMB={stats?.totalSizeMB ?? null}
        />
      </FixedLayer>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6">
        {courseId && (
          <div className="flex items-center gap-2 self-start rounded-full bg-surface-card px-3 py-1.5 shadow-sm">
            <span className="font-label-sm text-label-sm text-text-secondary">
              Difilter per matkul
            </span>
            <span className="font-label-sm text-label-sm font-semibold text-text-primary">
              {courseTitle ?? courseId}
            </span>
            <button
              type="button"
              onClick={onClearCourseFilter}
              aria-label="Hapus filter matkul"
              className="ml-1 flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        {error ? (
          <section
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl bg-surface-card p-8 shadow-sm"
          >
            <span className="flex items-center gap-2 text-error">
              <TriangleAlert className="size-5" aria-hidden="true" />
              <span className="font-headline-sm text-headline-sm font-semibold">
                Data berkas tidak bisa dimuat
              </span>
            </span>
            <p className="max-w-xl font-body-sm text-body-sm text-text-secondary">{error}</p>
            <Button variant="primary" size="sm" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Coba lagi</span>
            </Button>
          </section>
        ) : activeFolder ? (
          <FolderDetailView
            folder={activeFolder}
            onBack={closeFolder}
            onUploadInto={() => inputRef.current?.click()}
            files={paged}
            total={total}
            page={safePage}
            pageCount={pageCount}
            query={query}
            sort={sort}
            view={view}
            selectedIds={selected}
            allSelected={allSelected}
            onQueryChange={handleQueryChange}
            onSortCycle={cycleSort}
            onViewChange={setView}
            onPageChange={setPage}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onAsk={onAskFile}
            sortLabel={filesSortLabel(sort)}
            folders={folders}
            onMove={handleMove}
            moving={moving}
            onRenameFolder={openRenameFolder}
            onDeleteFolder={askDeleteFolder}
            onRenameFile={openRenameFile}
            onDeleteFiles={askDeleteFiles}
            deleting={deleting}
          />
        ) : (
          <>
            <FilesHeader
              typeFilter={typeFilter}
              onTypeChange={handleTypeChange}
              onUpload={() => inputRef.current?.click()}
              onNewFolder={openNewFolder}
              readyCount={stats?.indexed ?? null}
            />
            <StatsBento stats={stats} collections={folders.length} />
            <PinnedFolders
              folders={folders}
              loading={loading}
              onOpenFolder={openFolder}
              onRenameFolder={openRenameFolder}
              onDeleteFolder={askDeleteFolder}
            />
            {tab === 'trash' ? (
              <section className="flex flex-col items-center gap-2 rounded-xl bg-surface-card p-10 text-center shadow-sm">
                <p className="font-headline-sm text-headline-sm font-semibold text-text-primary">
                  Trash is empty
                </p>
                <p className="max-w-md font-body-sm text-body-sm text-text-secondary">
                  Deleted documents will appear here for 30 days before permanent removal.
                </p>
                <button
                  type="button"
                  onClick={() => onTabChange('all')}
                  className="mt-2 rounded-full bg-text-primary px-4 py-2 font-label-md text-label-md text-on-primary hover:bg-surface-dark"
                >
                  Back to All Files
                </button>
              </section>
            ) : (
              <section className="flex flex-col gap-3" aria-label="File terbaru">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
                    {showAll ? 'Semua Berkas' : 'File Terbaru'}
                  </h2>
                  {visible.length > RECENT_LIMIT && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAll((v) => !v)
                        setPage(1)
                      }}
                      className="font-label-md text-label-md text-secondary hover:underline"
                    >
                      {showAll ? 'Tampilkan ringkas' : `Lihat semua (${visible.length})`}
                    </button>
                  )}
                </div>
                <FilesTable
                  files={displayed}
                  total={showAll ? total : visible.length}
                  page={showAll ? safePage : 1}
                  pageCount={showAll ? pageCount : 1}
                  query={query}
                  sort={sort}
                  view={view}
                  selectedIds={selected}
                  allSelected={allSelected}
                  onQueryChange={handleQueryChange}
                  onSortCycle={cycleSort}
                  onViewChange={setView}
                  onPageChange={setPage}
                  onToggleSelect={toggleSelect}
                  onToggleAll={toggleAll}
                  onAsk={onAskFile}
                  sortLabel={filesSortLabel(sort)}
                  folders={folders}
                  onMove={handleMove}
                  moving={moving}
                  hidePagination={!showAll}
                  onRenameFile={openRenameFile}
                  onDeleteFiles={askDeleteFiles}
                  deleting={deleting}
                />
              </section>
            )}
          </>
        )}

        <Dropzone onFiles={handleFiles} inputRef={inputRef} />
        <ContextStatusBar contextLabel={courseTitle} readyCount={stats?.indexed ?? 0} />

        <NewFolderDialog
          open={folderDialogOpen}
          busy={folderBusy}
          error={folderError}
          activeCourseId={courseId}
          onClose={closeNewFolder}
          onSubmit={submitNewFolder}
        />

        <RenameDialog
          open={renameTarget !== null}
          title={renameTarget?.kind === 'folder' ? 'Ganti nama folder' : 'Ganti nama berkas'}
          initialName={renameTarget?.name ?? ''}
          showIcon={renameTarget?.kind === 'folder'}
          initialIcon={renameTarget?.kind === 'folder' ? renameTarget.icon : 'folder'}
          busy={renameBusy}
          error={renameError}
          duplicateHint={
            renameTarget?.kind === 'folder'
              ? 'Nama unik per scope — nama sama di matkul lain boleh.'
              : null
          }
          onClose={closeRename}
          onSubmit={submitRename}
        />

        <DeleteConfirmDialog
          open={filesToDelete !== null}
          title={filesToDelete && filesToDelete.length > 1 ? 'Hapus berkas-berkas?' : 'Hapus berkas?'}
          message={
            filesToDelete && (
              <>
                {deleteFileNames(filesToDelete)
                  .slice(0, 3)
                  .map((n) => (
                    <span key={n} className="font-semibold text-text-primary">
                      {n}
                      <br />
                    </span>
                  ))}
                {filesToDelete.length > 3 && (
                  <span>…dan {filesToDelete.length - 3} lainnya </span>
                )}
                akan dihapus permanen beserta indeksnya. Tindakan ini tidak bisa dibatalkan.
              </>
            )
          }
          confirmLabel="Hapus permanen"
          busy={deleting}
          error={deleteError}
          onClose={closeDelete}
          onConfirm={confirmDeleteFiles}
        />

        <DeleteConfirmDialog
          open={folderToDelete !== null}
          title="Hapus folder?"
          message={
            folderToDelete && (
              <>
                <span className="font-semibold text-text-primary">{folderToDelete.name}</span>{' '}
                akan dihapus permanen.
                {folderDeleteCount(folderToDelete) > 0 ? (
                  <>
                    {' '}{folderDeleteCount(folderToDelete)} berkas di dalamnya akan jadi file
                    lepas (tidak ikut terhapus).
                  </>
                ) : (
                  ' Folder ini kosong.'
                )}
              </>
            )
          }
          confirmLabel="Hapus folder"
          busy={deleting}
          error={deleteError}
          onClose={closeDelete}
          onConfirm={confirmDeleteFolder}
        />

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.csv,.xlsx,.txt,.json,.md"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
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
      </div>
    </>
  )
}
