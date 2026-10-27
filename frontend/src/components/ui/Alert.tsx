import type { ReactNode } from 'react'
import { AlertTriangle, Info, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

type Tone = 'info' | 'warning' | 'danger' | 'neutral'

const TONES: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    icon: Info,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    icon: AlertTriangle,
  },
  danger: {
    box: 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
    icon: XCircle,
  },
  neutral: { box: 'border-border-strong bg-surface-sunken text-fg', icon: Info },
}

/** Aviso dentro de la página con ícono, contenido y acción opcional a la derecha. */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { box, icon: Icon } = TONES[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
