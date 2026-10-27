import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import type { DashboardSummary, UserRole } from '../lib/types'
import { ExpirationsPanel } from './home/ExpirationsPanel'
import { MyEvaluationsCard } from './home/MyEvaluationsCard'
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

function HomePage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    refetchInterval: 60_000,
  })
  const isTeamReader = !!user && STAFF_READERS.includes(user.role)
  const firstName = user?.fullName.split(' ')[0]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-fg-muted first-letter:uppercase">{todayLabel()}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {isTeamReader ? 'Este es el estado de tu personal hoy.' : 'Este es tu resumen del día.'}
        </p>
      </div>

      {/* Lo propio del empleado (solo si su usuario está ligado a un empleado) */}
      {data?.me && (
        <div className="grid gap-6 lg:grid-cols-2">
          <MyShiftCard />
          <MyMonthCard me={data.me} />
          <div className="lg:col-span-2">
            <MyEvaluationsCard />
          </div>
        </div>
      )}

      {isTeamReader && <TeamDashboard team={data?.team} loading={isLoading} />}
      {isTeamReader && <ExpirationsPanel />}
    </div>
  )
}

export default HomePage
