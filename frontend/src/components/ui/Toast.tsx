import { useCallback, useState, type ReactNode } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ToastContext, type ToastKind } from './toast-context'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const ICONS = { success: CheckCircle2, error: XCircle }
const ICON_STYLES: Record<ToastKind, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t, { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-fg shadow-pop animate-pop-in"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_STYLES[t.kind])} />
              <p className="flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-fg-subtle hover:bg-surface-sunken hover:text-fg"
                aria-label="Cerrar notificación"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
