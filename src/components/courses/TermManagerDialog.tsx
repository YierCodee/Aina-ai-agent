import { useId, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  activateTerm,
  createTerm,
  type TermItem,
} from '@/lib/coursesApi'
import { cn } from '@/utils/cn'

type Props = {
  open: boolean
  /** null = mode kelola, 'create' = langsung fokus ke form buat. */
  initialMode: 'manage' | 'create'
  terms: TermItem[]
  busy: boolean
  error: string | null
  onClose: () => void
  onChanged: () => void
}

const field =
  'h-10 w-full rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'
const labelCls = 'font-label-md text-label-md font-medium text-text-primary'
const hintCls = 'font-label-sm text-label-sm text-text-secondary'

const SEMESTER_OPTIONS = [
  { id: 1 as const, label: 'Ganjil' },
  { id: 2 as const, label: 'Genap' },
]

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function TermManagerDialog({
  open,
  initialMode,
  terms,
  busy,
  error,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<'manage' | 'create'>(initialMode)
  const [label, setLabel] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [semesterNo, setSemesterNo] = useState<1 | 2>(1)
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [activate, setActivate] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Reset form saat dialog dibuka. Pola render-time adjustment, bukan
  // useEffect+setState (oxlint `react/set-state-in-effect`).
  const modeKey = `${open ? '1' : '0'}:${initialMode}`
  const [prevModeKey, setPrevModeKey] = useState(modeKey)
  if (prevModeKey !== modeKey) {
    setPrevModeKey(modeKey)
    setMode(initialMode)
    setLabel('')
    setAcademicYear('')
    setSemesterNo(1)
    setStartsOn('')
    setEndsOn('')
    setActivate(true)
    setFormError(null)
    setPendingId(null)
  }

  const yearId = useId()
  const labelId = useId()
  const semesterId = useId()
  const startsId = useId()
  const endsId = useId()
  const activateId = useId()

  const hasActive = terms.some((t) => t.isActive)

  const switchMode = (next: 'manage' | 'create') => {
    setMode(next)
    setFormError(null)
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setFormError(null)
    try {
      await createTerm({
        label: label.trim(),
        academicYear: academicYear.trim(),
        semesterNo,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        activate,
      })
      onChanged()
      setLabel('')
      setAcademicYear('')
      setSemesterNo(1)
      setStartsOn('')
      setEndsOn('')
      setActivate(true)
      setMode('manage')
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Gagal membuat semester.',
      )
    }
  }

  const handleActivate = async (term: TermItem) => {
    if (busy || pendingId) return
    setPendingId(term.id)
    setFormError(null)
    try {
      await activateTerm(term.id)
      onChanged()
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Gagal mengaktifkan semester.',
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <ModalContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-hidden p-0 sm:w-full">
        <ModalHeader className="shrink-0 px-6 pr-12 pt-6">
          <ModalTitle className="font-headline-sm text-headline-sm font-semibold">
            Kelola semester
          </ModalTitle>
          <ModalDescription>
            {hasActive
              ? 'Pilih semester yang sedang berjalan, atau tambah semester baru.'
              : 'Belum ada semester aktif. Buat satu supaya bisa mendaftarkan matkul.'}
          </ModalDescription>
        </ModalHeader>

        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-6">
            {mode === 'manage' && (
              <>
                {terms.length === 0 ? (
                  <p className="rounded-xl bg-surface-container-low p-4 font-body-sm text-body-sm text-text-secondary">
                    Belum ada semester. Buat yang pertama lewat form di bawah.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2" aria-label="Daftar semester">
                    {terms.map((term) => (
                      <li
                        key={term.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-body-sm text-body-sm font-medium text-text-primary">
                              {term.label}
                            </span>
                            {term.isActive && (
                              <Badge tone="brand">Aktif</Badge>
                            )}
                          </div>
                          <span className={cn('flex items-center gap-1.5', hintCls)}>
                            <CalendarDays className="size-3.5" aria-hidden="true" />
                            {term.academicYear} · Semester{' '}
                            {term.semesterNo === 1 ? 'Ganjil' : 'Genap'}
                            {term.startsOn &&
                              ` · ${formatDate(term.startsOn)} – ${formatDate(term.endsOn)}`}
                          </span>
                        </div>
                        {!term.isActive && (
                          <Button
                            type="button"
                            variant="soft"
                            size="sm"
                            onClick={() => handleActivate(term)}
                            disabled={busy || pendingId !== null}
                          >
                            {pendingId === term.id ? 'Mengaktifkan…' : 'Aktifkan'}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => switchMode('create')}
                  disabled={busy}
                  className="self-start"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span>Buat semester</span>
                </Button>
              </>
            )}

            {mode === 'create' && (
              <form onSubmit={handleCreate} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls} htmlFor={yearId}>
                    Tahun ajaran
                  </label>
                  <input
                    id={yearId}
                    className={field}
                    value={academicYear}
                    placeholder="2025/2026"
                    onChange={(e) => setAcademicYear(e.target.value)}
                    disabled={busy}
                  />
                  <span className={hintCls}>Format YYYY/YYYY, mis. 2025/2026.</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls} htmlFor={labelId}>
                    Label semester
                  </label>
                  <input
                    id={labelId}
                    className={field}
                    value={label}
                    placeholder="Semester Gasal 2025/2026"
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls} htmlFor={semesterId}>
                    Semester
                  </label>
                  <div
                    id={semesterId}
                    className="flex gap-2"
                    role="group"
                    aria-label="Jenis semester"
                  >
                    {SEMESTER_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={semesterNo === o.id}
                        onClick={() => setSemesterNo(o.id)}
                        disabled={busy}
                        className={cn(
                          'flex-1 rounded-full px-3 py-2 font-label-md text-label-md transition-colors',
                          semesterNo === o.id
                            ? 'bg-primary-container text-on-primary'
                            : 'bg-surface-container-low text-text-secondary hover:bg-surface-container hover:text-text-primary',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls} htmlFor={startsId}>
                      Tanggal mulai
                    </label>
                    <input
                      id={startsId}
                      type="date"
                      className={field}
                      value={startsOn}
                      onChange={(e) => setStartsOn(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls} htmlFor={endsId}>
                      Tanggal selesai
                    </label>
                    <input
                      id={endsId}
                      type="date"
                      className={field}
                      value={endsOn}
                      onChange={(e) => setEndsOn(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5">
                  <input
                    id={activateId}
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-primary-container)]"
                    checked={activate}
                    onChange={(e) => setActivate(e.target.checked)}
                    disabled={busy}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className={labelCls}>Jadikan semester aktif</span>
                    <span className={hintCls}>
                      {hasActive
                        ? 'Semester yang sedang aktif akan diganti.'
                        : 'Supaya matkul bisa langsung didaftarkan.'}
                    </span>
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => switchMode('manage')}
                    disabled={busy}
                  >
                    Kembali
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={busy}>
                    {busy ? 'Membuat…' : 'Buat semester'}
                  </Button>
                </div>
              </form>
            )}

            {(formError || error) && (
              <p
                role="alert"
                className="rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container"
              >
                {formError ?? error}
              </p>
            )}
          </div>
        </div>

        <ModalFooter className="shrink-0 gap-2 border-t border-border-subtle px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Tutup
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
