import { TriangleAlert } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { CourseItem } from '@/data/courses'

type Props = {
  open: boolean
  course: CourseItem | null
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Konfirmasi melepas matkul dari semester.
 *
 * Judul dan tombol sengaja memakai kata "lepas", bukan "hapus": yang terjadi
 * adalah `enrollments.status` jadi `'dropped'`. Materi, minggu, dan dosennya
 * tetap utuh dan bisa dipulihkan — dan dialog ini mengatakannya supaya
 * pengguna tidak mengira sedang menghapus data permanen.
 */
export function CourseDeleteDialog({
  open,
  course,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2 font-headline-sm text-headline-sm font-semibold">
            <TriangleAlert className="size-5 text-error" aria-hidden="true" />
            Lepas dari semester?
          </ModalTitle>
          <ModalDescription>
            {course ? (
              <>
                <span className="font-semibold text-text-primary">{course.title}</span> (
                {course.code}) akan hilang dari daftar semester ini.
              </>
            ) : (
              'Mata kuliah ini akan hilang dari daftar semester ini.'
            )}{' '}
            Materi dan silabusnya tetap tersimpan, jadi bisa dipasang lagi kapan saja
            selama semester yang sama masih berjalan.
          </ModalDescription>
        </ModalHeader>

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
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={busy || !course}
          >
            {busy ? 'Melepas…' : 'Lepas dari semester'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
