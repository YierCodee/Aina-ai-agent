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

type Props = {
  open: boolean
  /** Mis. 'Hapus berkas?' */
  title: string
  /** Penjelasan konsekuensi — mendukung nama tebal via ReactNode. */
  message: React.ReactNode
  /** Mis. 'Hapus permanen'. */
  confirmLabel: string
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
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
            {title}
          </ModalTitle>
          <ModalDescription>{message}</ModalDescription>
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
          <Button type="button" variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Menghapus…' : confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
