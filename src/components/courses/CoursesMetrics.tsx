import { BookOpen, Database, GraduationCap, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CourseMetrics } from '@/data/courses'

const card =
  'flex flex-col justify-between rounded-2xl bg-surface-card p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-colors duration-200 hover:bg-surface-container-lowest'

type Props = {
  /**
   * Angka dikirim backend, bukan dihitung dari array lokal.
   *
   * Tidak ada nilai default yang fabricated: sebelum backend siap, halaman
   * menampilkan skeleton, bukan angka 0 yang terlihat meyakinkan. `0` adalah
   * nilai yang sah (semester tanpa matkul), jadi tidak boleh jadi placeholder.
   */
  metrics: CourseMetrics | null
  termLabel?: string
  onManageTerms?: () => void
}

/**
 * Empat metric card.
 *
 * Perubahan dari versi lama: angka "Isolated" dan "dedicated tutors" dulu
 * hardcode `100%` dan `8 dedicated tutors`. Sekarang keduanya berasal dari
 * `course_tutors` — Isolation dihitung dari offering yang punya `rag_namespace`
 * sendiri, jadi angkanya bisa turun kalau ada matkul tanpa tutor.
 */
export function CoursesMetrics({ metrics, termLabel, onManageTerms }: Props) {
  const totalCourses = metrics?.totalCourses ?? 0
  const totalSks = metrics?.totalSks ?? 0
  const totalFiles = metrics?.totalFiles ?? 0
  const avgProgress = metrics?.avgProgress ?? 0
  const ragIsolation = metrics?.ragIsolation ?? 0
  const dedicatedTutors = metrics?.dedicatedTutors ?? 0

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Course metrics">
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Matkul Aktif
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {totalCourses}
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">
                {totalSks} SKS
              </span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <GraduationCap className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          {onManageTerms ? (
            <button
              type="button"
              onClick={onManageTerms}
              className="inline-flex items-center gap-1 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              aria-label="Kelola semester"
            >
              <Badge tone="neutral">{termLabel || 'Semester berjalan'}</Badge>
            </button>
          ) : (
            <Badge tone="neutral">{termLabel || 'Semester berjalan'}</Badge>
          )}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Materi Terindeks
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {totalFiles}
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Files RAG</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <Database className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Badge tone="neutral">
            <span className="size-1.5 rounded-full bg-secondary" aria-hidden="true" />
            Vector Sandbox aktif
          </Badge>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              Rata-rata Progress
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {avgProgress}%
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Silabus</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="pt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full rounded-full bg-secondary" style={{ width: `${avgProgress}%` }} />
          </div>
          <div className="flex items-center justify-between pt-2.5">
            <span className="font-label-sm text-label-sm text-text-secondary">{totalCourses} matkul</span>
            <span className="font-label-sm text-label-sm text-text-secondary">Target: 100%</span>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-text-secondary">
              AI Tutor Context
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-tight text-text-primary tabular-nums">
                {ragIsolation}%
              </span>
              <span className="font-body-sm text-body-sm font-medium text-text-secondary">Isolated</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Badge tone="neutral">{dedicatedTutors} dedicated tutors</Badge>
        </div>
      </div>
    </section>
  )
}
