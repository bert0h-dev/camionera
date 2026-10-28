import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClose: () => void
  children: ReactNode
}

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function Modal({ open, title, description, size = 'md', onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // Evitar que la página de fondo haga scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      // Un clic fuera no cierra: se perdería lo capturado. Se cierra con la X, Cancelar o Esc
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-pop animate-pop-in sm:rounded-2xl',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
