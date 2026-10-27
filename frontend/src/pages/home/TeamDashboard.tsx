import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, ClipboardCheck, FileWarning, Star, UserCheck, Users, UserX } from 'lucide-react'
import { STAFF_ROLE_LABELS, type DashboardSummary } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { AttendanceTrendChart } from './AttendanceTrendChart'
import { StatCard } from './StatCard'

type Team = NonNullable<DashboardSummary['team']>

export function TeamDashboard({ team, loading }: { team: Team | null | undefined; loading: boolean }) {
  const t = team
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <div className="space-y-6">
      {/* Indicadores del día */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Personal activo"
          icon={Users}
          loading={loading}
          value={t?.staff.active ?? 0}
          hint={
            t &&
            [
              t.staff.vacation && plural(t.staff.vacation, 'de vacaciones', 'de vacaciones'),
              t.staff.sickLeave && plural(t.staff.sickLeave, 'incapacitado', 'incapacitados'),
              t.staff.suspended && plural(t.staff.suspended, 'suspendido', 'suspendidos'),
            ]
              .filter(Boolean)
              .join(' · ')
          }
          to="/personal"
        />
        <StatCard
          label="En turno ahora"
          icon={UserCheck}
          tone="success"
          loading={loading}
          value={t?.today.onShiftNow ?? 0}
          hint={t && `${t.today.working} con entrada registrada · ${t.today.scheduled} con turno hoy`}
          to="/turnos"
        />
        <StatCard
          label="Sin registrar entrada"
          icon={UserX}
          tone={t?.today.missingCheckIn ? 'danger' : 'info'}
          loading={loading}
          value={t?.today.missingCheckIn ?? 0}
          hint={t && `${t.today.attendance.late} retardo(s) · ${t.today.attendance.absent} falta(s) hoy`}
          to="/asistencias"
        />
        <StatCard
          label="Documentos por atender"
          icon={FileWarning}
          tone={t?.documents.expired ? 'danger' : 'accent'}
          loading={loading}
          value={(t?.documents.expired ?? 0) + (t?.documents.expiring ?? 0)}
          hint={t && `${t.documents.expired} vencido(s) · ${t.documents.expiring} en ${t.documents.alertDays} días`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Asistencia de los últimos 7 días"
            description="Registros por estado; pasa el cursor sobre un día para ver el detalle"
            actions={
              <Link to="/asistencias" className="text-sm font-medium text-link hover:underline">
                Ver asistencias
              </Link>
            }
          />
          <CardBody>
            {loading || !t ? <Skeleton className="h-56 w-full" /> : <AttendanceTrendChart rows={t.trend} />}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Personal por puesto" description="Empleados activos" />
            <CardBody className="space-y-3">
              {loading || !t ? (
                <Skeleton className="h-32 w-full" />
              ) : t.staff.byRole.length === 0 ? (
                <p className="text-sm text-fg-muted">Aún no hay empleados activos.</p>
              ) : (
                t.staff.byRole.map((r) => {
                  const max = t.staff.byRole[0].count
                  return (
                    <div key={r.role}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-fg">{STAFF_ROLE_LABELS[r.role]}</span>
                        <span className="tabular font-medium text-fg">{r.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-sunken">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pendientes" />
            <ul className="divide-y divide-border text-sm">
              <PendingRow
                to="/evaluaciones"
                icon={Star}
                label="Evaluaciones en borrador"
                value={t?.evaluations.drafts}
              />
              <PendingRow
                to="/evaluaciones"
                icon={ClipboardCheck}
                label="Evaluaciones sin 'enterado'"
                value={t?.evaluations.pendingAcknowledge}
              />
              <PendingRow to="/turnos" icon={CalendarClock} label="Con turno hoy" value={t?.today.scheduled} />
              {!!t?.today.missingCheckIn && (
                <PendingRow
                  to="/asistencias"
                  icon={AlertTriangle}
                  label="Entradas por registrar"
                  value={t.today.missingCheckIn}
                  danger
                />
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PendingRow({
  to,
  icon: Icon,
  label,
  value,
  danger,
}: {
  to: string
  icon: typeof Star
  label: string
  value: number | undefined
  danger?: boolean
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted">
        <Icon className={danger ? 'size-4 text-red-500' : 'size-4 text-fg-subtle'} />
        <span className="flex-1 text-fg">{label}</span>
        <span className="tabular font-semibold text-fg">{value ?? '—'}</span>
      </Link>
    </li>
  )
}
