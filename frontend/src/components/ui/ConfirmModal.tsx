import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Eliminar', loading, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-slate-700">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
