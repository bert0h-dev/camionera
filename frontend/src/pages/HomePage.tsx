import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import type { DashboardSummary, UserRole } from '../lib/types'
import { HeroStat } from '../components/ui/HeroStat'
import { LiveClock } from '../components/ui/LiveClock'
import { PageHeader } from '../components/ui/PageHeader'
import { ExpirationsPanel } from './home/ExpirationsPanel'
import { BusExpirationsPanel } from './home/BusExpirationsPanel'
import { MaintenanceDuePanel, MyOrdersPanel } from './home/MaintenancePanels'
import { MyEvaluationsCard } from './home/MyEvaluationsCard'
import { MyPayslipsCard } from './home/MyPayslipsCard'
import { MyMonthCard } from './home/MyMonthCard'
import { MyShiftCard } from './home/MyShiftCard'
import { TeamDashboard } from './home/TeamDashboard'

const STAFF_READERS: UserRole[] = ['admin', 'hr', 'supervisor', 'coordinator']
const TZ = 'America/Mexico_City'

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()),
  )
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

const todayLabel = () =>
  new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date())

type Team = NonNullable<DashboardSummary['team']>

/** Mensaje de la banda: lo más urgente del día en una frase. */
function headline(team: Team | null | undefined, isTeamReader: boolean) {
  if (!isTeamReader) return 'Este es tu resumen del día.'
  if (!team) return 'Cargando el estado del personal…'
  const n = team.today.missingCheckIn
  if (n > 0) return `${n} ${n === 1 ? 'persona no ha' : 'personas no han'} registrado su entrada a tiempo.`
  if (team.today.scheduled === 0) return 'No hay turnos programados para hoy.'
  return 'Todo el personal con turno ha registrado su entrada.'
}

function HomePage() {
  const { user } = useAuth()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    refetchInterval: 60_000,
  })
  const isTeamReader = !!user && STAFF_READERS.includes(user.role)
  const isFleetReader = !!user && ['admin', 'coordinator', 'supervisor'].includes(user.role)
  const t = data?.team
  const firstName = user?.fullName.split(' ')[0]

  // Series de 7 días para las mini-gráficas
  const attended = t?.trend.map((d) => d.present + d.late + d.half_day)
  const lates = t?.trend.map((d) => d.late)
  const todayTotal = t ? t.today.attendance.present + t.today.attendance.late + t.today.attendance.half_day : 0
  const rate = t?.today.started ? Math.round((todayTotal / t.today.started) * 100) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          <>
            <span className="first-letter:uppercase">{todayLabel()}</span> · {headline(t, isTeamReader)}
          </>
        }
        aside={<LiveClock />}
        refreshing={isFetching && !isLoading}
        stats={
          isTeamReader && (
            <>
              <HeroStat
                label="En turno ahora"
                value={t?.today.onShiftNow ?? 0}
                hint={t && `de ${t.today.scheduled} con turno hoy · ${t.today.working} con entrada`}
                badge={<span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">● en vivo</span>}
                trend={attended}
                to="/turnos"
                loading={isLoading}
              />
              <HeroStat
                label="Sin registrar entrada"
                value={t?.today.missingCheckIn ?? 0}
                hint="pasaron la tolerancia de retardo"
                tone={t?.today.missingCheckIn ? 'danger' : 'neutral'}
                to="/asistencias"
                loading={isLoading}
              />
              <HeroStat
                label="Asistencia de hoy"
                value={rate === null ? '—' : `${rate}%`}
                hint={t && `de ${t.today.started} turnos iniciados · ${t.today.attendance.late} retardo(s)`}
                tone={rate !== null && rate >= 90 ? 'success' : rate !== null ? 'warning' : 'neutral'}
                trend={lates}
                to="/asistencias"
                loading={isLoading}
              />
              <HeroStat
                label="Documentos por atender"
                value={(t?.documents.expired ?? 0) + (t?.documents.expiring ?? 0)}
                hint={
                  t && `${t.documents.expired} vencido(s) · ${t.documents.expiring} en ${t.documents.alertDays} días`
                }
                tone={t?.documents.expired ? 'danger' : t?.documents.expiring ? 'warning' : 'neutral'}
                loading={isLoading}
              />
            </>
          )
        }
      />

      {/* Lo propio del empleado (solo si su usuario está ligado a un empleado) */}
      {data?.me && (
        <div className="grid gap-6 lg:grid-cols-2">
          <MyShiftCard />
          <MyMonthCard me={data.me} />
          <div className="lg:col-span-2">
            <MyEvaluationsCard />
          </div>
          <div className="lg:col-span-2">
            <MyPayslipsCard />
          </div>
        </div>
      )}

      {isTeamReader && <TeamDashboard team={t} />}
      {isTeamReader && <ExpirationsPanel />}
      {isFleetReader && <MaintenanceDuePanel />}
      {isFleetReader && <BusExpirationsPanel />}
      {user?.role === 'mechanic' && <MyOrdersPanel />}
    </div>
  )
}

export default HomePage
