import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Star, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { STAFF_ROLE_LABELS, type DashboardSummary } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { AttendanceTrendChart } from './AttendanceTrendChart'
import { EntryBoard } from './EntryBoard'

type Team = NonNullable<DashboardSummary['team']>

// Colores fijos por posición para la barra de puestos (de mayor a menor)
const ROLE_COLORS = ['bg-indigo-600', 'bg-indigo-400', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500', 'bg-slate-400']

/** Cuerpo del dashboard para lectores de personal (las cifras van en la banda de HomePage). */
export function TeamDashboard({ team }: { team: Team | null | undefined }) {
  if (!team)
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl xl:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )

  const roles = team.staff.byRole
  const topRoles = roles.slice(0, ROLE_COLORS.length - 1)
  const others = roles.slice(ROLE_COLORS.length - 1).reduce((t, r) => t + r.count, 0)
  const segments = [
    ...topRoles.map((r, i) => ({ label: STAFF_ROLE_LABELS[r.role], count: r.count, color: ROLE_COLORS[i] })),
    ...(others ? [{ label: 'Otros', count: others, color: ROLE_COLORS.at(-1)! }] : []),
  ]

  const attention: { to: string; icon: LucideIcon; count: number; text: string; tone: string }[] = [
    {
      to: '/asistencias',
      icon: AlertTriangle,
      count: team.today.missingCheckIn,
      text: 'sin registrar entrada, pasada la tolerancia',
      tone: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200',
    },
    {
      to: '/evaluaciones',
      icon: Star,
      count: team.evaluations.drafts,
      text: 'evaluaciones en borrador',
      tone: 'bg-primary-soft text-primary-soft-fg',
    },
  ].filter((a) => a.count > 0)

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Tablero de entradas"
          description="Turnos de hoy; primero quien debió llegar y no ha registrado entrada"
          actions={
            <Link
              to="/asistencias"
              className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
            >
              Ver asistencias <ArrowRight className="size-4" />
            </Link>
          }
        />
        <CardBody className="space-y-6">
          <EntryBoard entries={team.board} />
          <div>
            <h3 className="mb-3 text-sm font-semibold text-fg">Asistencia de los últimos 7 días</h3>
            <AttendanceTrendChart rows={team.trend} />
          </div>
        </CardBody>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title="Requiere atención" />
        <CardBody className="flex flex-1 flex-col gap-3">
          {attention.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              Todo en orden por ahora.
            </p>
          ) : (
            attention.map((a) => (
              <Link
                key={a.text}
                to={a.to}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-opacity hover:opacity-85',
                  a.tone,
                )}
              >
                <span className="font-data w-8 text-xl font-bold">{a.count}</span>
                <span className="flex-1">{a.text}</span>
                <a.icon className="size-4 shrink-0 opacity-70" />
              </Link>
            ))
          )}

          <div className="mt-auto border-t border-border pt-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-fg">Personal por puesto</h3>
              <span className="font-data text-xs text-fg-muted">{team.staff.active} activos</span>
            </div>
            {segments.length === 0 ? (
              <p className="text-sm text-fg-muted">Aún no hay empleados activos.</p>
            ) : (
              <>
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                  {segments.map((s) => (
                    <div
                      key={s.label}
                      className={s.color}
                      style={{ flexGrow: s.count }}
                      title={`${s.label}: ${s.count}`}
                    />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {segments.map((s) => (
                    <li key={s.label} className="flex items-center gap-2 text-fg-muted">
                      <span className={cn('size-2 rounded-sm', s.color)} />
                      <span className="flex-1 truncate">{s.label}</span>
                      <span className="font-data font-medium text-fg">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
