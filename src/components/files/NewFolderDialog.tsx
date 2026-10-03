import { useId, useState } from 'react'
import { Cpu, Folder, FolderOpen, Lock } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fetchCourses } from '@/lib/coursesApi'
import { cn } from '@/utils/cn'

const ICON_OPTIONS = [
  { id: 'folder' as const, label: 'Folder', Icon: Folder },
  { id: 'shared' as const, label: 'Shared', Icon: FolderOpen },
  { id: 'code' as const, label: 'Code', Icon: Cpu },
  { id: 'lock' as const, label: 'Private', Icon: Lock },
]

type IconId = (typeof ICON_OPTIONS)[number]['id']

export type NewFolderBody = {
  name: string
  icon: IconId
  /** Course.id untuk scope matkul; null = folder global. */
  courseId: string | null
}

type Props = {
  open: boolean
  busy: boolean
  error: string | null
  /** Filter matkul yang sedang aktif di FilesPage — jadi default scope. */
  activeCourseId: string | null
  onClose: () => void
  onSubmit: (body: NewFolderBody) => void
}

const field =
  'h-10 w-full rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'
const labelCls = 'font-label-md text-label-md font-medium text-text-primary'
const hintCls = 'font-label-sm text-label-sm text-text-secondary'

export function NewFolderDialog({ open, busy, error, activeCourseId, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconId>('folder')
  const [scope, setScope] = useState<'global' | 'course'>(activeCourseId ? 'course' : 'global')
  const [courseId, setCourseId] = useState<string | null>(activeCourseId)
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [touched, setTouched] = useState(false)

  // Reset + muat daftar matkul tiap dialog dibuka. Pola render-time
  // adjustment (tanpa useEffect+setState) mengikuti CourseFormDialog.
  const openKey = `${open ? '1' : '0'}:${activeCourseId ?? ''}`
  const [prevKey, setPrevKey] = useState(openKey)
  if (prevKey !== openKey) {
    setPrevKey(openKey)
    setName('')
    setIcon('folder')
    setScope(activeCourseId ? 'course' : 'global')
    setCourseId(activeCourseId)
    setCourses([])
    setTouched(false)
    if (open) {
      void fetchCourses({ limit: 100 }).then(
        (res) => setCourses(res.items.map((c) => ({ id: c.id, title: c.title }))),
        () => setCourses([]),
      )
    }
  }

  const nameId = useId()
  const scopeId = useId()
  const courseIdAttr = useId()

  const nameError = !name.trim() ? 'Nama folder wajib diisi.' : undefined
  const scopeError =
    scope === 'course' && !courseId ? 'Pilih mata kuliah untuk scope ini.' : undefined
  const valid = !nameError && !scopeError

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || busy) return
    onSubmit({ name: name.trim(), icon, courseId: scope === 'course' ? courseId : null })
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="font-headline-sm text-headline-sm font-semibold">
            Buat folder baru
          </ModalTitle>
          <ModalDescription>
            Folder virtual untuk mengelompokkan berkas. Isi &amp; ukuran dihitung
            otomatis dari berkas di dalamnya.
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} htmlFor={nameId}>
              Nama folder
            </label>
            <input
              id={nameId}
              className={field}
              value={name}
              placeholder="Slide kuliah"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {touched && nameError ? (
              <span className="font-label-sm text-label-sm text-error">{nameError}</span>
            ) : (
              <span className={hintCls}>Unik per scope — nama sama di matkul lain boleh.</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelCls} id={scopeId}>
              Ikon
            </span>
            <div className="flex gap-2" role="group" aria-labelledby={scopeId}>
              {ICON_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={icon === id}
                  onClick={() => setIcon(id)}
                  disabled={busy}
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 transition-colors',
                    icon === id
                      ? 'bg-primary-container text-on-primary'
                      : 'bg-surface-container-low text-text-secondary hover:bg-surface-container hover:text-text-primary',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Scope</span>
            <div className="flex gap-2" role="group" aria-label="Scope folder">
              {(
                [
                  { id: 'global' as const, label: 'Global' },
                  { id: 'course' as const, label: 'Per matkul' },
                ]
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={scope === o.id}
                  onClick={() => setScope(o.id)}
                  disabled={busy}
                  className={cn(
                    'flex-1 rounded-full px-3 py-2 font-label-md text-label-md transition-colors',
                    scope === o.id
                      ? 'bg-primary-container text-on-primary'
                      : 'bg-surface-container-low text-text-secondary hover:bg-surface-container hover:text-text-primary',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {scope === 'course' && (
              <div className="flex flex-col gap-1.5 pt-1">
                <label className={labelCls} htmlFor={courseIdAttr}>
                  Mata kuliah
                </label>
                <select
                  id={courseIdAttr}
                  className={cn(field, 'px-3')}
                  value={courseId ?? ''}
                  onChange={(e) => setCourseId(e.target.value || null)}
                  disabled={busy}
                >
                  <option value="">Pilih matkul…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                {touched && scopeError && (
                  <span className="font-label-sm text-label-sm text-error">{scopeError}</span>
                )}
              </div>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container"
            >
              {error}
            </p>
          )}

          <ModalFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy || !valid}>
              {busy ? 'Membuat…' : 'Buat folder'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
