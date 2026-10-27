import { Monitor, Smartphone, X } from 'lucide-react'
import { describeDevice, isMobile } from '../../lib/device'
import type { UserSession } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
})

/** Lista de sesiones abiertas; `onRevoke` habilita el botón para cerrar cada una. */
export function SessionList({
  sessions,
  onRevoke,
  revokingId,
}: {
  sessions: UserSession[]
  onRevoke?: (id: string) => void
  revokingId?: string
}) {
  if (sessions.length === 0) return <p className="px-5 py-6 text-sm text-fg-muted">No hay sesiones abiertas.</p>
  return (
    <ul className="divide-y divide-border">
      {sessions.map((s) => {
        const Icon = isMobile(s.userAgent) ? Smartphone : Monitor
        return (
          <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                {describeDevice(s.userAgent)}
                {s.current && (
                  <Badge tone="success" dot>
                    Esta sesión
                  </Badge>
                )}
              </div>
              <div className="font-data mt-0.5 text-xs text-fg-muted">
                {s.ipAddress ?? 'IP desconocida'} · activa {DATE_TIME.format(new Date(s.lastActiveAt))} · inició{' '}
                {DATE_TIME.format(new Date(s.startedAt))}
              </div>
            </div>
            {onRevoke && !s.current && (
              <Button variant="ghost" size="sm" icon={X} loading={revokingId === s.id} onClick={() => onRevoke(s.id)}>
                Cerrar
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
