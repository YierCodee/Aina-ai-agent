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
import { cn } from '@/utils/cn'

const ICON_OPTIONS = [
  { id: 'folder' as const, label: 'Folder', Icon: Folder },
  { id: 'shared' as const, label: 'Shared', Icon: FolderOpen },
  { id: 'code' as const, label: 'Code', Icon: Cpu },
  { id: 'lock' as const, label: 'Private', Icon: Lock },
]

export type RenameIcon = (typeof ICON_OPTIONS)[number]['id']

type Props = {
  open: boolean
  /** Judul dialog, mis. 'Ganti nama berkas'. */
  title: string
  /** Nama awal yang diedit. */
  initialName: string
  /** true = tampilkan pilih ikon (rename folder). */
  showIcon?: boolean
  initialIcon?: RenameIcon
  busy: boolean
  error: string | null
  /** Boleh null untuk rename berkas (tanpa ikon). */
  duplicateHint?: string | null
  onClose: () => void
  onSubmit: (name: string, icon: RenameIcon | null) => void
}

const field =
  'h-10 w-full rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm text-body-sm text-text-primary placeholder:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'
const labelCls = 'font-label-md text-label-md font-medium text-text-primary'

export function RenameDialog({
  open,
  title,
  initialName,
  showIcon = false,
  initialIcon = 'folder',
  busy,
  error,
  duplicateHint = null,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState<RenameIcon>(initialIcon)
  const [touched, setTouched] = useState(false)

  // Reset tiap dibuka dengan target baru (pola CourseFormDialog).
  const openKey = `${open ? '1' : '0'}:${initialName}:${initialIcon}`
  const [prevKey, setPrevKey] = useState(openKey)
  if (prevKey !== openKey) {
    setPrevKey(openKey)
    setName(initialName)
    setIcon(initialIcon)
    setTouched(false)
  }

  const nameId = useId()
  const nameError = !name.trim() ? 'Nama wajib diisi.' : undefined
  const valid = !nameError

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || busy) return
    onSubmit(name.trim(), showIcon ? icon : null)
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="font-headline-sm text-headline-sm font-semibold">
            {title}
          </ModalTitle>
          {duplicateHint && <ModalDescription>{duplicateHint}</ModalDescription>}
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} htmlFor={nameId}>
              Nama baru
            </label>
            <input
              id={nameId}
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {touched && nameError && (
              <span className="font-label-sm text-label-sm text-error">{nameError}</span>
            )}
          </div>

          {showIcon && (
            <div className="flex gap-2" role="group" aria-label="Ikon folder">
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
          )}

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
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
