import { useId, useState } from 'react'
import { CalendarDays, MessageSquare, X } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TaskActionKind, TaskPriority, TaskWorkflowItem } from '@/data/tasks'
import { cn } from '@/utils/cn'

const PRIORITY_OPTIONS: { id: TaskPriority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'normal', label: 'Normal' },
]

/**
 * Label tombol aksi ikut jenisnya — `TaskCard` hanya menampilkan `label`, jadi
 * label dan `actionKind` harus来之 berpasangan.
 */
const ACTION_OPTIONS: { id: TaskActionKind; label: string; Icon: typeof MessageSquare }[] = [
  { id: 'open', label: 'Open Document', Icon: CalendarDays },
  { id: 'comment', label: 'Comment', Icon: MessageSquare },
]

const MAX_TITLE = 255

/** Bentuk payload yang dipakai halaman; cermin `CreateTaskInput` di `lib/tasksApi.ts`. */
export type TaskCreateBody = {
  title: string
  priority: TaskPriority
  /** ISO string; null = tanpa tenggat (`scheduleKind` jadi 'continuous'). */
  dueAt: string | null
  note: string | null
  tags: string[]
  workflowId: string | null
  actionKind: TaskActionKind
  actionLabel: string
}

type Draft = {
  title: string
  priority: TaskPriority
  date: string
  time: string
  note: string
  tags: string[]
  tagInput: string
  workflowId: string | null
  actionKind: TaskActionKind
}

const EMPTY_DRAFT: Draft = {
  title: '',
  priority: 'normal',
  date: '',
  time: '',
  note: '',
  tags: [],
  tagInput: '',
  workflowId: null,
  actionKind: 'open',
}

type Props = {
  open: boolean
  busy: boolean
  error: string | null
  workflows: TaskWorkflowItem[]
  onClose: () => void
  onSubmit: (body: TaskCreateBody) => void
}

/** Kelas input & label — disalin dari `CourseFormDialog` agar konsisten. */
const field =
  'h-10 w-full rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'
const labelCls = 'font-label-md text-label-md font-medium text-text-primary'
const hintCls = 'font-label-sm text-label-sm text-text-secondary'
const segmentedBtn = (active: boolean) =>
  cn(
    'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 font-label-md text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'bg-primary-container text-on-primary'
      : 'bg-surface-container-low text-text-secondary hover:bg-surface-container hover:text-text-primary',
  )

/** `YYYY-MM-DD` untuk nilai default `<input type="date">`. */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `HH:MM` untuk nilai default `<input type="time">`. */
function isoTime(hours: number, minutes = 0): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Backend menyimpan nama tag verbatim lalu mencocokkannya dengan `LIKE %…%`
 * huruf kecil (`services/task_service.py`). Tanpa normalisasi, `#LMS` dan
 * `#lms` akan tersimpan sebagai dua tag berbeda — jadi satu `#` di depan
 * selalu dinormalkan di sini, bukan oleh server.
 */
function normalizeTag(raw: string): string {
  const body = raw.trim().replace(/^#+/, '').trim()
  return body ? `#${body}` : ''
}

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

export function TaskCreateDialog({ open, busy, error, workflows, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  // Error baru tampil setelah submit dicoba atau field judulITINGgal fokus —
  // bukan begitu user menyentuh field lain, supaya tidak menakut-nakuti.
  const [showErrors, setShowErrors] = useState(false)

  // Reset form saat dialog dibuka. Sengaja TIDAK `useEffect` + setState: itu
  // memicu render kedua dan kena `react/set-state-in-effect` dari oxlint.
  // Pola yang sama dipakai `NewFolderDialog` dan `CourseFormDialog`.
  const openKey = open ? '1' : '0'
  const [prevKey, setPrevKey] = useState(openKey)
  if (prevKey !== openKey) {
    setPrevKey(openKey)
    setDraft(EMPTY_DRAFT)
    setShowErrors(false)
  }

  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }))
  }

  const tagId = useId()
  const priorityId = useId()
  const actionId = useId()

  const commitTags = (raw: string) => {
    const added = normalizeTag(raw)
    setDraft((d) => {
      const exists = d.tags.some((t) => t.toLowerCase() === added.toLowerCase())
      return {
        ...d,
        tags: !added || exists ? d.tags : [...d.tags, added],
        tagInput: '',
      }
    })
  }

  const removeTag = (target: string) => {
    patch({ tags: draft.tags.filter((t) => t !== target) })
  }

  const applyPreset = (kind: 'today' | 'tomorrow' | 'nextweek') => {
    const d = new Date()
    if (kind === 'tomorrow') d.setDate(d.getDate() + 1)
    if (kind === 'nextweek') d.setDate(d.getDate() + 7)
    const hour = kind === 'tomorrow' ? 9 : 17
    patch({ date: isoDate(d), time: isoTime(hour) })
  }

  const titleError = !draft.title.trim() ? 'Judul task wajib diisi.' : undefined
  const titleTooLong = draft.title.trim().length > MAX_TITLE
  const valid = !titleError && !titleTooLong && !busy

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShowErrors(true)
    if (!valid) return
    const dueAt =
      draft.date && draft.time ? new Date(`${draft.date}T${draft.time}`).toISOString() : null
    const action = ACTION_OPTIONS.find((o) => o.id === draft.actionKind) ?? ACTION_OPTIONS[0]
    onSubmit({
      title: draft.title.trim(),
      priority: draft.priority,
      dueAt,
      note: draft.note.trim() ? draft.note.trim() : null,
      tags: draft.tags,
      workflowId: draft.workflowId,
      actionKind: action.id,
      actionLabel: action.label,
    })
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      {/*
        Sheet: header & footer sticky (shrink-0), scroll hanya di body form —
        pola yang sama dengan `CourseFormDialog`.
      */}
      <ModalContent className="flex max-h-[85dvh] max-w-xl flex-col overflow-hidden p-0 sm:w-full">
        <ModalHeader className="shrink-0 px-6 pr-12 pt-6">
          <ModalTitle className="font-headline-sm text-headline-sm font-semibold">
            Tambah task
          </ModalTitle>
          <ModalDescription>
            Satu formulir untuk judul, tenggat, konteks, dan tombol aksi di kartu task.
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-7">
              <Section title="Detail">
                <Field
                  label="Judul task"
                  error={titleTooLong ? `Maksimal ${MAX_TITLE} karakter.` : showErrors ? titleError : undefined}
                  hint="Kalau kosong, form tidak akan kirim."
                >
                  {(id) => (
                    <input
                      id={id}
                      className={field}
                      value={draft.title}
                      maxLength={MAX_TITLE + 20}
                      placeholder="Review 12 unread LMS discussion posts"
                      onChange={(e) => patch({ title: e.target.value })}
                      onBlur={() => setShowErrors(true)}
                      disabled={busy}
                      autoFocus
                    />
                  )}
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className={labelCls} id={priorityId}>
                    Prioritas
                  </span>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby={priorityId}>
                    {PRIORITY_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={draft.priority === o.id}
                        onClick={() => patch({ priority: o.id })}
                        disabled={busy}
                        className={segmentedBtn(draft.priority === o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Jadwal">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Tanggal" hint="Kosongkan untuk task tanpa tenggat.">
                    {(id) => (
                      <input
                        id={id}
                        type="date"
                        className={field}
                        value={draft.date}
                        onChange={(e) => patch({ date: e.target.value })}
                        disabled={busy}
                      />
                    )}
                  </Field>
                  <Field label="Jam" hint="Berlaku bila tanggal diisi.">
                    {(id) => (
                      <input
                        id={id}
                        type="time"
                        className={field}
                        value={draft.time}
                        onChange={(e) => patch({ time: e.target.value })}
                        disabled={busy}
                      />
                    )}
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'today' as const, label: 'Hari ini, EOD' },
                      { id: 'tomorrow' as const, label: 'Besok, 09:00' },
                      { id: 'nextweek' as const, label: 'Minggu depan, 17:00' },
                    ]
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      disabled={busy}
                      className="rounded-full bg-surface-container-low px-3 py-1.5 font-label-sm text-label-sm text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Konteks">
                <Field
                  label="Workflow"
                  hint="Opsional — mengikat task ke courseline yang sudah ada."
                >
                  {(id) => (
                    <select
                      id={id}
                      className={cn(field, 'px-3')}
                      value={draft.workflowId ?? ''}
                      onChange={(e) => patch({ workflowId: e.target.value || null })}
                      disabled={busy}
                    >
                      <option value="">Tanpa workflow</option>
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label} ({w.count})
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls} htmlFor={tagId}>
                    Tag
                  </label>
                  <input
                    id={tagId}
                    className={field}
                    value={draft.tagInput}
                    placeholder="#ExamPrep"
                    onChange={(e) => setDraft((d) => ({ ...d, tagInput: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        commitTags(draft.tagInput)
                        return
                      }
                      // Backspace di input kosong → hapus tag terakhir.
                      if (e.key === 'Backspace' && !draft.tagInput && draft.tags.length > 0) {
                        removeTag(draft.tags[draft.tags.length - 1])
                      }
                    }}
                    disabled={busy}
                  />
                  {draft.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draft.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-text-secondary"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            disabled={busy}
                            aria-label={`Hapus tag ${tag}`}
                            className="text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <span className={hintCls}>Enter atau koma untuk menambah. Satu `#` otomatis.</span>
                </div>
              </Section>

              <Section title="Catatan">
                <Field label="Note" hint="Tampil sebagai baris kecil di kartu task.">
                  {(id) => (
                    <textarea
                      id={id}
                      rows={3}
                      className={cn(field, 'h-auto resize-y rounded-2xl py-3')}
                      value={draft.note}
                      placeholder="Parsing 14 lecture slides"
                      onChange={(e) => patch({ note: e.target.value })}
                      disabled={busy}
                    />
                  )}
                </Field>
              </Section>

              <Section title="Aksi">
                <div className="flex flex-col gap-1.5">
                  <span className={labelCls} id={actionId}>
                    Tombol di kartu
                  </span>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby={actionId}>
                    {ACTION_OPTIONS.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={draft.actionKind === id}
                        onClick={() => patch({ actionKind: id })}
                        disabled={busy}
                        className={segmentedBtn(draft.actionKind === id)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mx-6 mb-2 shrink-0 rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container"
            >
              {error}
            </p>
          )}

          <ModalFooter className="shrink-0 gap-2 border-t border-border-subtle px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!valid}>
              {busy ? 'Menyimpan…' : 'Simpan task'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}