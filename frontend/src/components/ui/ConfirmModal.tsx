import { AlertTriangle, HelpCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /** danger: acción destructiva (rojo); primary: confirmación normal */
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  tone = confirmLabel === 'Eliminar' ? 'danger' : 'primary',
  loading,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const Icon = tone === 'danger' ? AlertTriangle : HelpCircle
  return (
    <Modal open={open} title={title} size="sm" onClose={onClose}>
      <div className="flex gap-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            tone === 'danger'
              ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
              : 'bg-primary-soft text-primary-soft-fg',
          )}
        >
          <Icon className="size-5" />
        </span>
        <p className="pt-2 text-sm text-fg-muted">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant={tone} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
