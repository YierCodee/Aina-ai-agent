import { memo, useEffect, useRef, useState } from 'react'
import { FileStack, Mail, MoreVertical, Pencil, Star, Trash2, Zap } from 'lucide-react'
import { toneClass, type CourseItem } from '@/data/courses'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

type CardProps = {
  course: CourseItem
  onAskTutor: (course: CourseItem) => void
  onOpenMaterial: (course: CourseItem) => void
  onEdit: (course: CourseItem) => void
  onToggleFeatured: (course: CourseItem) => void
  onDrop: (course: CourseItem) => void
  /** Menonaktifkan menu selama request berjalan. */
  busy?: boolean
}

export const CourseCard = memo(function CourseCard({
  course,
  onAskTutor,
  onOpenMaterial,
  onEdit,
  onToggleFeatured,
  onDrop,
  busy = false,
}: CardProps) {
  const dark = course.featured
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Menu ditutup saat klik di luar atau tekan Escape. Tanpa ini, menu tetap
  // menempel setelah pindah halaman karena `PageTransition` hanya animate,
  // bukan unmount.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <article
      aria-label={course.title}
      className={cn(
        'flex flex-col justify-between gap-5 rounded-2xl p-5 transition-colors duration-200',
        dark
          ? 'bg-surface-dark text-on-primary shadow-[0_8px_24px_rgba(15,23,42,0.12)]'
          : 'bg-surface-card shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:bg-surface-container-lowest',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dark ? 'brand' : 'neutral'}>
              {course.sks} SKS • {course.code}
            </Badge>
            <span
              className={cn(
                'font-label-sm text-label-sm',
                dark ? 'text-inverse-primary' : 'text-text-secondary',
              )}
            >
              {course.kelas}
            </span>
          </div>
          <Badge tone={dark ? 'brand' : 'neutral'}>
            <span className="size-1.5 rounded-full bg-success-emerald" aria-hidden="true" />
            RAG Active
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          <h3
            className={cn(
              'font-headline-md text-headline-md font-semibold tracking-tight',
              dark ? 'text-on-primary' : 'text-text-primary',
            )}
          >
            {course.title}
          </h3>
          <p className={cn('font-body-sm text-body-sm', dark ? 'text-inverse-primary' : 'text-text-secondary')}>
            Fokus: {course.focus}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
              toneClass(course.lecturer.tone),
            )}
            aria-hidden="true"
          >
            {course.lecturer.initial}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn('truncate font-label-md text-label-md font-semibold', dark ? 'text-on-primary' : 'text-text-primary')}>
              {course.lecturer.name}
            </span>
            <span className={cn('truncate font-body-sm text-body-sm', dark ? 'text-inverse-primary' : 'text-text-secondary')}>
              Konsultasi: {course.lecturer.consult}
            </span>
          </div>
          <a
            href={`mailto:${course.lecturer.email ?? 'dosen@kampus.ac.id'}?subject=${encodeURIComponent(course.title)}`}
            aria-label={`Email dosen ${course.title}`}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              dark ? 'bg-white/10 text-on-primary hover:bg-white/20' : 'bg-surface text-text-secondary hover:bg-surface-container hover:text-text-primary',
            )}
          >
            <Mail className="size-4" aria-hidden="true" />
          </a>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-label-sm text-label-sm">
            <span className={dark ? 'text-inverse-primary' : 'text-text-secondary'}>{course.weekLabel}</span>
            <span className={cn('font-semibold tabular-nums', dark ? 'text-on-primary' : 'text-text-primary')}>
              {course.progress}%
            </span>
          </div>
          <div
            className={cn('h-2 w-full overflow-hidden rounded-full', dark ? 'bg-white/15' : 'bg-surface-container')}
            role="progressbar"
            aria-valuenow={course.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progress ${course.title}`}
          >
            <div className="h-full rounded-full bg-secondary" style={{ width: `${course.progress}%` }} />
          </div>
        </div>

        <div
          className={cn(
            'flex items-center justify-between rounded-xl px-3 py-2 font-label-sm text-label-sm',
            dark ? 'bg-white/10 text-inverse-primary' : 'bg-surface-container-low text-text-secondary',
          )}
        >
          <span className="flex items-center gap-1.5">
            <FileStack className="size-4" aria-hidden="true" />
            {course.ragFiles} Files terindeks
          </span>
          <span className="font-semibold tabular-nums">⚡ {course.ragChunks} chunks</span>
        </div>

        <div
          className={cn(
            'flex items-start gap-2.5 rounded-xl p-3',
            dark ? 'bg-white/10' : 'bg-surface-container-low',
          )}
        >
          <span className="text-lg leading-none" aria-hidden="true">
            {course.tutor?.emoji}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className={cn('font-label-md text-label-md font-semibold', dark ? 'text-on-primary' : 'text-text-primary')}>
              {course.tutor?.name ?? 'Tutor belum diatur'}
            </span>
            <span className={cn('font-body-sm text-body-sm', dark ? 'text-inverse-primary' : 'text-text-secondary')}>
              {course.tutor?.desc ?? 'Hubungi admin Subject Learning Center.'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!course.tutor}
          onClick={() => onAskTutor(course)}
          className={dark ? 'flex-1 border-white/20 bg-surface-card text-text-primary hover:bg-surface-container' : 'flex-1'}
        >
          <Zap className="size-4" aria-hidden="true" />
          <span>{course.tutor ? `Tanya ${course.tutor.name}` : 'Tutor belum ada'}</span>
        </Button>
        <Button variant={dark ? 'ghost' : 'soft'} size="sm" onClick={() => onOpenMaterial(course)} className={dark ? 'text-on-primary hover:bg-white/10' : undefined}>
          <span>Buka Materi</span>
        </Button>

        {/*
          Menu aksi. `variant="tool"` — bukan solid — sesuai aturan "satu aksi
          hitam per layar": solid per-row akan membuat tiap kartu punya CTA gelap
          kedua. Pola dropdown absolutnya mengikuti `PinnedFolders` supaya tidak
          menambah dependensi Radix baru.
        */}
        <div ref={menuRef} className="relative">
          <Button
            variant="tool"
            size="icon-sm"
            aria-label={`Aksi untuk ${course.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            className={dark ? 'text-on-primary hover:bg-white/10' : undefined}
          >
            <MoreVertical className="size-[18px]" aria-hidden="true" />
          </Button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={`Aksi untuk ${course.title}`}
              className="absolute bottom-full right-0 z-30 mb-1 w-48 overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-1 shadow-lg"
            >
              <MenuItem
                icon={Pencil}
                label="Sunting"
                onClick={() => { setMenuOpen(false); onEdit(course) }}
              />
              <MenuItem
                icon={Star}
                label={course.featured ? 'Hapus dari unggulan' : 'Jadikan unggulan'}
                onClick={() => { setMenuOpen(false); onToggleFeatured(course) }}
                disabled={busy}
              />
              <MenuItem
                icon={Trash2}
                label="Lepas dari semester"
                tone="danger"
                onClick={() => { setMenuOpen(false); onDrop(course) }}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  )
})

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label-md text-label-md transition-colors',
        tone === 'danger'
          ? 'text-error hover:bg-error-container hover:text-on-error-container'
          : 'text-text-primary hover:bg-surface-container-low',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  )
}

type GroupProps = {
  title: string
  dot: string
  count: number
  actionLabel: string
  children: React.ReactNode
}

export function CourseGroup({ title, dot, count, actionLabel, children }: GroupProps) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-2.5 rounded-full', dot)} aria-hidden="true" />
          <h2 className="font-headline-sm text-headline-sm font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          <Badge tone="card" className="bg-surface-card text-text-secondary shadow-sm">
            {count} Matkul
          </Badge>
        </div>
        <span className="font-label-sm text-label-sm text-secondary">{actionLabel}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{children}</div>
    </section>
  )
}
