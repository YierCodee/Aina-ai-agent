import { useId, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  TONE_CLASSES,
  type AvatarTone,
  type CourseDraft,
  type CourseItem,
  type TutorDraft,
  type WeekDraft,
} from '@/data/courses'
import { cn } from '@/utils/cn'

type Props = {
  open: boolean
  /** null = mode create, terisi = mode edit. */
  course: CourseItem | null
  initial: CourseDraft
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (draft: CourseDraft) => void
  /** Dipasang halaman saat error "tidak ada semester aktif" butuh jalan keluar. */
  onManageTerms?: () => void
}

const TONE_OPTIONS: AvatarTone[] = [
  'secondary',
  'success-emerald',
  'tertiary-container',
  'primary-container',
  'surface-tint',
  'surface-dark',
]

const KIND_OPTIONS = [
  { id: 'teori' as const, label: 'Teori' },
  { id: 'praktikum' as const, label: 'Praktikum' },
]

const MEETING_OPTIONS = [
  { id: 'teori' as const, label: 'Teori' },
  { id: 'praktikum' as const, label: 'Praktikum' },
  { id: 'uts' as const, label: 'UTS' },
  { id: 'uas' as const, label: 'UAS' },
  { id: 'review' as const, label: 'Review' },
]

/** Kelas input. `rounded-full` mengikuti `ui/input.tsx`; teks 13px muted. */
const field =
  'h-10 w-full rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'
const labelCls = 'font-label-md text-label-md font-medium text-text-primary'
const hintCls = 'font-label-sm text-label-sm text-text-secondary'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {error ? (
        <span className="font-label-sm text-label-sm text-error">{error}</span>
      ) : hint ? (
        <span className={hintCls}>{hint}</span>
      ) : null}
    </div>
  )
}

export function CourseFormDialog({
  open,
  course,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
  onManageTerms,
}: Props) {
  const [draft, setDraft] = useState<CourseDraft>(initial)
  const [touched, setTouched] = useState(false)
  const [showWeeks, setShowWeeks] = useState(false)

  // Reset form saat dibuka dengan draft baru.
  //
  // Sengaja TIDAK pakai `useEffect` + setState: itu memicu render kedua dan
  // oxlint menandainya (`react/set-state-in-effect`). Pola yang dipakai adalah
  // penyesuaian state saat render — komponen hanya dirender ulang dengan nilai
  // prop yang sama saat belum ada draft. Pola sama sudah dipakai `FilesPage`
  // untuk reset pagination.
  const draftKey = `${open ? '1' : '0'}:${initial.code}:${initial.title}:${initial.classLabel}`
  const [prevDraftKey, setPrevDraftKey] = useState(draftKey)
  if (prevDraftKey !== draftKey) {
    setPrevDraftKey(draftKey)
    setDraft(initial)
    setTouched(false)
    setShowWeeks(initial.weeks.length > 0)
  }

  const patch = (changes: Partial<CourseDraft>) => {
    setDraft((d) => ({ ...d, ...changes }))
    setTouched(true)
  }

  const errors = useMemo(() => validate(draft), [draft])
  const valid = Object.keys(errors).length === 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTouched(true)
    if (!valid || busy) return
    onSubmit(draft)
  }

  const show = (key: keyof DraftErrors) => (touched ? errors[key] : undefined)

  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      {/*
        Layout sheet: header & footer sticky (shrink-0), yang scroll hanya
        body form. Scrollbar disembunyikan (`scrollbar-none` di index.css)
        tapi scroll wheel/touch tetap jalan.
      */}
      <ModalContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-0 sm:w-full">
        <ModalHeader className="shrink-0 px-6 pr-12 pt-6">
          <ModalTitle className="font-headline-sm text-headline-sm font-semibold">
            {course ? 'Sunting mata kuliah' : 'Daftarkan mata kuliah'}
          </ModalTitle>
          <ModalDescription>
            {course
              ? 'Field yang tidak diubah tidak akan disentuh backend.'
              : 'Satu formulir membuat katalog, kelas, dan pendaftaran sekaligus ke semester aktif.'}
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-7">
          <Section title="Identitas">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Kode" error={show('code')}>
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={draft.code}
                    placeholder="IF-301"
                    onChange={(e) => patch({ code: e.target.value })}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label="Nama mata kuliah" error={show('title')}>
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={draft.title}
                    placeholder="Basis Data"
                    onChange={(e) => patch({ title: e.target.value })}
                    disabled={busy}
                  />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Jenis">
                {(id) => (
                  <div id={id} className="flex gap-2" role="group" aria-label="Jenis mata kuliah">
                    {KIND_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={draft.kind === o.id}
                        onClick={() => patch({ kind: o.id })}
                        disabled={busy}
                        className={cn(
                          'flex-1 rounded-full px-3 py-2 font-label-md text-label-md transition-colors',
                          draft.kind === o.id
                            ? 'bg-primary-container text-on-primary'
                            : 'bg-surface-container-low text-text-secondary hover:bg-surface-container hover:text-text-primary',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="SKS" error={show('sks')}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    max={12}
                    className={field}
                    value={draft.sks}
                    onChange={(e) => patch({ sks: Number(e.target.value) })}
                    disabled={busy}
                  />
                )}
              </Field>
            </div>

            <Field label="Fokus bahasan" hint="Tampil sebagai baris &quot;Fokus:&quot; di kartu.">
              {(id) => (
                <textarea
                  id={id}
                  rows={2}
                  className={cn(field, 'h-auto min-h-20 resize-none rounded-2xl py-2.5')}
                  value={draft.focus}
                  placeholder="SQL, relasi, normalisasi, query"
                  onChange={(e) => patch({ focus: e.target.value })}
                  disabled={busy}
                />
              )}
            </Field>
          </Section>

          <Section title="Kelas">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Nama kelas"
                error={show('classLabel')}
                hint='Tanpa kurung ruang, mis. "Kelas A (R. 401)".'
              >
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={draft.classLabel}
                    placeholder="Kelas A (R. 401)"
                    onChange={(e) => patch({ classLabel: e.target.value })}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label="Ruang" hint="Boleh dikosongkan.">
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={draft.room}
                    placeholder="R. 401"
                    onChange={(e) => patch({ room: e.target.value })}
                    disabled={busy}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section title="Dosen & tutor">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nama dosen" error={show('lecturer')}>
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={draft.lecturer.name}
                    placeholder="Dr. Ratna Kusuma, S.Kom., M.T."
                    onChange={(e) =>
                      patch({ lecturer: { ...draft.lecturer, name: e.target.value } })
                    }
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label="Email dosen" hint="Dipakai untuk tombol surel di kartu.">
                {(id) => (
                  <input
                    id={id}
                    type="email"
                    className={field}
                    value={draft.lecturer.email}
                    placeholder="nama@kampus.ac.id"
                    onChange={(e) =>
                      patch({ lecturer: { ...draft.lecturer, email: e.target.value } })
                    }
                    disabled={busy}
                  />
                )}
              </Field>
            </div>

            <Field label="Warna avatar">
              {(id) => (
                <div id={id} className="flex flex-wrap gap-2 pb-1" role="group" aria-label="Warna avatar">
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      aria-label={tone}
                      aria-pressed={draft.lecturer.tone === tone}
                      title={tone}
                      onClick={() => patch({ lecturer: { ...draft.lecturer, tone } })}
                      disabled={busy}
                      className={cn(
                        'size-8 rounded-full transition-transform',
                        TONE_CLASSES[tone],
                        draft.lecturer.tone === tone && 'ring-2 ring-secondary ring-offset-2 ring-offset-surface-card',
                      )}
                    />
                  ))}
                </div>
              )}
            </Field>

            <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-4">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-primary-container)]"
                  checked={draft.tutor !== null}
                  onChange={(e) =>
                    patch({
                      tutor: e.target.checked
                        ? (draft.tutor ?? { id: null, name: '', description: '', emoji: '🤖' })
                        : null,
                    })
                  }
                  disabled={busy}
                />
                <span className="flex flex-col gap-0.5">
                  <span className={labelCls}>Tutor AI khusus</span>
                  <span className={hintCls}>
                    Setiap matkul dengan tutor punya sandbox RAG sendiri. Melepas tutor akan
                    menurunkan angka isolasi konteks.
                  </span>
                </span>
              </label>

              {draft.tutor && (
                <TutorFields
                  tutor={draft.tutor}
                  busy={busy}
                  nameError={show('tutorName')}
                  onChange={(tutor) => patch({ tutor })}
                />
              )}
            </div>
          </Section>

          <Section title="Progres">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Progres (%)" error={show('progress')}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    max={100}
                    className={field}
                    value={draft.progressPercent}
                    onChange={(e) => patch({ progressPercent: Number(e.target.value) })}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label="Minggu berjalan" error={show('currentWeek')}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    max={20}
                    className={field}
                    value={draft.currentWeek}
                    onChange={(e) => patch({ currentWeek: Number(e.target.value) })}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label="Tandai unggulan">
                {(id) => (
                  <label
                    htmlFor={id}
                    className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface-container-low px-4"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="size-4 accent-[var(--color-primary-container)]"
                      checked={draft.featured}
                      onChange={(e) => patch({ featured: e.target.checked })}
                      disabled={busy}
                    />
                    <span className="font-label-md text-label-md text-text-primary">
                      Ya
                    </span>
                  </label>
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowWeeks((v) => !v)}
                aria-expanded={showWeeks}
                className="flex items-center gap-2 self-start font-label-md text-label-md text-secondary hover:underline"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>
                  {showWeeks ? 'Sembunyikan' : 'Kelola'} silabus mingguan ({draft.weeks.length})
                </span>
              </button>
              {showWeeks && (
                <WeekEditor
                  weeks={draft.weeks}
                  busy={busy}
                  onChange={(weeks) => patch({ weeks })}
                />
              )}
            </div>
          </Section>

              {error && (
                <div className="flex flex-col gap-2">
                  <p
                    role="alert"
                    className="rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container"
                  >
                    {error}
                  </p>
                  {onManageTerms && /semester aktif/i.test(error) && (
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={onManageTerms}
                      disabled={busy}
                      className="self-start"
                    >
                      Kelola semester
                    </Button>
                  )}
                </div>
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
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy || !valid}>
              {busy ? 'Menyimpan…' : course ? 'Simpan perubahan' : 'Daftarkan'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}

/**
 * Field tutor. Dipisah jadi komponen sendiri supaya TypeScript tidak perlu
 * menebak `draft.tutor` yang nullable — narrowing `x.y` hilang begitu masuk
 * arrow function, dan `x!` berulang di setiap handler itu rapuh.
 */
function TutorFields({
  tutor,
  busy,
  nameError,
  onChange,
}: {
  tutor: TutorDraft
  busy: boolean
  nameError: string | undefined
  onChange: (tutor: TutorDraft) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[80px_1fr]">
      <Field label="Emoji">
        {(id) => (
          <input
            id={id}
            className={cn(field, 'text-center text-lg')}
            value={tutor.emoji}
            maxLength={4}
            onChange={(e) => onChange({ ...tutor, emoji: e.target.value })}
            disabled={busy}
          />
        )}
      </Field>
      <Field label="Nama tutor" error={nameError}>
        {(id) => (
          <input
            id={id}
            className={field}
            value={tutor.name}
            placeholder="DB Tutor AI"
            onChange={(e) => onChange({ ...tutor, name: e.target.value })}
            disabled={busy}
          />
        )}
      </Field>
      <div className="sm:col-span-2">
        <Field label="Deskripsi" hint="Tampil di kartu matkul.">
          {(id) => (
            <input
              id={id}
              className={field}
              value={tutor.description}
              placeholder="Bantuin SQL & ERD."
              onChange={(e) => onChange({ ...tutor, description: e.target.value })}
              disabled={busy}
            />
          )}
        </Field>
      </div>
    </div>
  )
}

function WeekEditor({
  weeks,
  busy,
  onChange,
}: {
  weeks: WeekDraft[]
  busy: boolean
  onChange: (weeks: WeekDraft[]) => void
}) {
  const update = (index: number, changes: Partial<WeekDraft>) => {
    onChange(weeks.map((w, i) => (i === index ? { ...w, ...changes } : w)))
  }
  const remove = (index: number) => onChange(weeks.filter((_, i) => i !== index))
  const add = () => {
    const used = new Set(weeks.map((w) => w.weekNo))
    let next = 1
    while (used.has(next) && next <= 20) next += 1
    if (next > 20) return
    onChange([...weeks, { weekNo: next, title: '', meetingKind: 'teori', completed: false }])
  }

  if (weeks.length === 0) {
    return (
      <p className="rounded-xl bg-surface-card p-4 font-body-sm text-body-sm text-text-secondary">
        Belum ada minggu terdaftar. Label minggu di kartu akan tampil sebagai &quot;Minggu
        N&quot; tanpa topik — itu tidak apa-apa.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => (
        <div
          key={index}
          className="grid grid-cols-1 items-center gap-2 rounded-xl bg-surface-card p-3 sm:grid-cols-[64px_1fr_130px_auto]"
        >
          <input
            type="number"
            min={1}
            max={20}
            aria-label={`Nomor minggu ke-${index + 1}`}
            className={cn(field, 'h-9 text-center')}
            value={week.weekNo}
            onChange={(e) => update(index, { weekNo: Number(e.target.value) })}
            disabled={busy}
          />
          <input
            aria-label={`Topik minggu ${week.weekNo}`}
            className={cn(field, 'h-9')}
            value={week.title}
            placeholder="Topik minggu ini"
            onChange={(e) => update(index, { title: e.target.value })}
            disabled={busy}
          />
          <select
            aria-label={`Jenis pertemuan minggu ${week.weekNo}`}
            className={cn(field, 'h-9 px-3')}
            value={week.meetingKind}
            onChange={(e) =>
              update(index, { meetingKind: e.target.value as WeekDraft['meetingKind'] })
            }
            disabled={busy}
          >
            {MEETING_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <label className="flex cursor-pointer items-center gap-1.5 px-1">
              <input
                type="checkbox"
                aria-label={`Tandai selesai minggu ${week.weekNo}`}
                className="size-4 accent-[var(--color-primary-container)]"
                checked={week.completed}
                onChange={(e) => update(index, { completed: e.target.checked })}
                disabled={busy}
              />
              <span className="font-label-sm text-label-sm text-text-secondary">
                Selesai
              </span>
            </label>
            <Button
              type="button"
              variant="tool"
              size="icon-sm"
              aria-label={`Hapus minggu ${week.weekNo}`}
              onClick={() => remove(index)}
              disabled={busy}
              className="text-error hover:bg-error-container hover:text-on-error-container"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="soft"
        size="sm"
        onClick={add}
        disabled={busy || weeks.length >= 20}
        className="self-start"
      >
        <Plus className="size-4" aria-hidden="true" />
        <span>Tambah minggu</span>
      </Button>
    </div>
  )
}

type DraftErrors = {
  code?: string
  title?: string
  sks?: string
  classLabel?: string
  lecturer?: string
  tutorName?: string
  progress?: string
  currentWeek?: string
}

/**
 * Validasi yang sama dengan batas CHECK di database, supaya kesalahan muncul
 * sebelum request dan pesan yang tampil spesifik per field.
 */
function validate(draft: CourseDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.code.trim()) errors.code = 'Kode wajib diisi.'
  else if (draft.code.trim().length < 2) errors.code = 'Kode minimal 2 karakter.'
  if (!draft.title.trim()) errors.title = 'Nama wajib diisi.'
  if (!Number.isFinite(draft.sks) || draft.sks < 0 || draft.sks > 12)
    errors.sks = 'SKS harus 0-12.'
  if (!draft.classLabel.trim()) errors.classLabel = 'Nama kelas wajib diisi.'
  if (!draft.lecturer.name.trim()) errors.lecturer = 'Nama dosen wajib diisi.'
  if (draft.tutor && !draft.tutor.name.trim())
    errors.tutorName = 'Nama tutor wajib diisi, atau lepaskan centang tutor.'
  if (
    !Number.isFinite(draft.progressPercent) ||
    draft.progressPercent < 0 ||
    draft.progressPercent > 100
  )
    errors.progress = 'Progres harus 0-100.'
  if (!Number.isFinite(draft.currentWeek) || draft.currentWeek < 1)
    errors.currentWeek = 'Minggu minimal 1.'
  return errors
}
