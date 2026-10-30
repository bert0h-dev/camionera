import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bus, SlidersHorizontal, TramFront, Users } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, apiErrorMessage } from '../lib/api'
import type { DashboardSummary, UserRole } from '../lib/types'
import { Button } from '../components/ui/Button'
import { HeroStat } from '../components/ui/HeroStat'
import { LiveClock } from '../components/ui/LiveClock'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Tabs, type TabItem } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toast-context'
import { useBusSummary, useMaintenanceSummary } from './fleet/useFleet'
import { FleetOverview } from './home/FleetOverview'
import { MyOrdersPanel } from './home/MaintenancePanels'
import { MyEvaluationsCard } from './home/MyEvaluationsCard'
import { MyMonthCard } from './home/MyMonthCard'
import { MyPayslipsCard } from './home/MyPayslipsCard'
import { MyShiftCard } from './home/MyShiftCard'
import { PendingPanel } from './home/PendingPanel'
import { TeamDashboard } from './home/TeamDashboard'
import { TripsOverview } from './home/TripsOverview'
import { businessFormat } from '../lib/format'

const STAFF_READERS: UserRole[] = ['admin', 'hr', 'supervisor', 'coordinator']
const FLEET_READERS: UserRole[] = ['admin', 'coordinator', 'supervisor']
const TRIP_READERS: UserRole[] = ['admin', 'coordinator', 'supervisor']
const AREA_KEY = 'home.area'

type Section = 'pending' | 'me' | 'staff' | 'fleet' | 'trips' | 'myOrders'
type Area = 'staff' | 'fleet' | 'trips'

const SECTION_LABELS: Record<Section, { label: string; hint: string }> = {
  pending: { label: 'Pendientes', hint: 'Documentos y preventivos vencidos o por vencer' },
  me: { label: 'Mi información', hint: 'Mi turno, mi mes, mis evaluaciones y recibos' },
  staff: { label: 'Personal', hint: 'Tablero de entradas, asistencia y puestos' },
  fleet: { label: 'Flota', hint: 'Estado de las unidades y del taller' },
  trips: { label: 'Recorridos', hint: 'Avance del día y lo que está en operación' },
  myOrders: { label: 'Mis órdenes de trabajo', hint: 'Órdenes de mantenimiento asignadas' },
}

function greeting() {
  const h = Number(businessFormat({ hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

const todayLabel = () => businessFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

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

const readArea = (): Area | null => {
  try {
    const v = localStorage.getItem(AREA_KEY)
    return v === 'staff' || v === 'fleet' || v === 'trips' ? v : null
  } catch {
    return null
  }
}

function HomePage() {
  const { user } = useAuth()
  const role = user?.role
  const isTeamReader = !!role && STAFF_READERS.includes(role)
  const isFleetReader = !!role && FLEET_READERS.includes(role)
  const isTripReader = !!role && TRIP_READERS.includes(role)
  const isMechanic = role === 'mechanic'

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    refetchInterval: 60_000,
  })
  const prefs = useQuery({
    queryKey: ['dashboard', 'preferences'],
    queryFn: async () => (await api.get<{ hiddenSections: Section[] }>('/dashboard/preferences')).data,
    staleTime: Infinity,
  })
  const pending = useQuery({
    queryKey: ['dashboard', 'pending'],
    queryFn: async () => (await api.get<{ severity: string; area: string }[]>('/dashboard/pending')).data,
    enabled: isTeamReader || isFleetReader,
  })
  const buses = useBusSummary(isFleetReader)
  const shop = useMaintenanceSummary(isMechanic)
  const [areaChoice, setAreaChoice] = useState<Area | null>(readArea)
  const [customizing, setCustomizing] = useState(false)

  // Secciones que existen para este usuario (según su rol y si está ligado a un empleado)
  const available: Section[] = [
    ...(isTeamReader || isFleetReader ? (['pending'] as const) : []),
    ...(data?.me ? (['me'] as const) : []),
    ...(isTeamReader ? (['staff'] as const) : []),
    ...(isFleetReader ? (['fleet'] as const) : []),
    ...(isTripReader ? (['trips'] as const) : []),
    ...(isMechanic ? (['myOrders'] as const) : []),
  ]
  const hidden = new Set(prefs.data?.hiddenSections ?? [])
  const show = (s: Section) => available.includes(s) && !hidden.has(s)

  const areaTabs: TabItem<Area>[] = [
    ...(show('staff') ? [{ key: 'staff' as const, label: 'Personal', icon: Users }] : []),
    ...(show('fleet') ? [{ key: 'fleet' as const, label: 'Flota', icon: Bus }] : []),
    ...(show('trips') ? [{ key: 'trips' as const, label: 'Recorridos', icon: TramFront }] : []),
  ]
  const area = areaTabs.find((a) => a.key === areaChoice)?.key ?? areaTabs[0]?.key
  const chooseArea = (a: Area) => {
    setAreaChoice(a)
    try {
      localStorage.setItem(AREA_KEY, a)
    } catch {
      // sin almacenamiento solo se pierde la pestaña elegida
    }
  }

  const t = data?.team
  const firstName = user?.fullName.split(' ')[0]
  const attended = t?.trend.map((d) => d.present + d.late + d.half_day)
  const lates = t?.trend.map((d) => d.late)
  const todayTotal = t ? t.today.attendance.present + t.today.attendance.late + t.today.attendance.half_day : 0
  const rate = t?.today.started ? Math.round((todayTotal / t.today.started) * 100) : null
  const urgent = pending.data?.filter((p) => p.severity === 'overdue').length ?? 0
  const pendingTotal = pending.data?.length ?? 0

  // Banda: 4 cifras como máximo, elegidas por rol
  const onShift = (
    <HeroStat
      key="onShift"
      label="En turno ahora"
      value={t?.today.onShiftNow ?? 0}
      hint={t && `de ${t.today.scheduled} con turno hoy`}
      badge={<span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">● en vivo</span>}
      trend={attended}
      to="/turnos"
      loading={isLoading}
    />
  )
  const attendance = (
    <HeroStat
      key="attendance"
      label="Asistencia de hoy"
      value={rate === null ? '—' : `${rate}%`}
      hint={t && `${t.today.missingCheckIn} sin entrada · ${t.today.attendance.late} retardo(s)`}
      tone={
        t?.today.missingCheckIn
          ? 'danger'
          : rate !== null && rate >= 90
            ? 'success'
            : rate !== null
              ? 'warning'
              : 'neutral'
      }
      trend={lates}
      to="/asistencias"
      loading={isLoading}
    />
  )
  const pendingStat = (
    <HeroStat
      key="pending"
      label="Pendientes"
      value={pendingTotal}
      hint={`${urgent} vencido(s)`}
      tone={urgent ? 'danger' : pendingTotal ? 'warning' : 'success'}
      loading={pending.isLoading}
    />
  )
  const stats = isMechanic
    ? [
        <HeroStat
          key="inProgress"
          label="En proceso"
          value={shop.data?.inProgress ?? 0}
          tone="primary"
          to="/flota/mantenimiento"
          loading={shop.isLoading}
        />,
        <HeroStat
          key="scheduled"
          label="Programadas"
          value={shop.data?.scheduled ?? 0}
          to="/flota/mantenimiento"
          loading={shop.isLoading}
        />,
      ]
    : isFleetReader
      ? [
          onShift,
          attendance,
          <HeroStat
            key="buses"
            label="Unidades disponibles"
            value={buses.data?.available ?? 0}
            hint={buses.data && `de ${buses.data.total} · ${buses.data.maintenance} en taller`}
            tone={buses.data?.unfit ? 'warning' : 'neutral'}
            to="/flota/unidades"
            loading={buses.isLoading}
          />,
          pendingStat,
        ]
      : isTeamReader
        ? [
            onShift,
            attendance,
            <HeroStat
              key="missing"
              label="Sin registrar entrada"
              value={t?.today.missingCheckIn ?? 0}
              hint="pasaron la tolerancia de retardo"
              tone={t?.today.missingCheckIn ? 'danger' : 'neutral'}
              to="/asistencias"
              loading={isLoading}
            />,
            pendingStat,
          ]
        : []

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
        actions={
          available.length > 1 && (
            <Button variant="glass" icon={SlidersHorizontal} onClick={() => setCustomizing(true)}>
              Personalizar
            </Button>
          )
        }
        refreshing={isFetching && !isLoading}
        stats={stats.length > 0 && <>{stats}</>}
      />

      {show('pending') && <PendingPanel />}

      {show('me') && data?.me && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">Mi información</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <MyShiftCard />
            <MyMonthCard me={data.me} />
            <MyEvaluationsCard />
            <MyPayslipsCard />
          </div>
        </section>
      )}

      {show('myOrders') && <MyOrdersPanel />}

      {area && (
        <section className="space-y-4">
          {areaTabs.length > 1 && <Tabs items={areaTabs} value={area} onChange={chooseArea} />}
          {area === 'staff' && <TeamDashboard team={t} />}
          {area === 'fleet' && <FleetOverview />}
          {area === 'trips' && <TripsOverview />}
        </section>
      )}

      {customizing && (
        <CustomizeModal
          available={available}
          hidden={prefs.data?.hiddenSections ?? []}
          onClose={() => setCustomizing(false)}
        />
      )}
    </div>
  )
}

/** Mostrar u ocultar secciones de Inicio; se guarda por usuario en el servidor. */
function CustomizeModal({
  available,
  hidden,
  onClose,
}: {
  available: Section[]
  hidden: Section[]
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(() => new Set(hidden))
  const save = useMutation({
    mutationFn: (hiddenSections: Section[]) => api.put('/dashboard/preferences', { hiddenSections }),
    onSuccess: (res) => {
      queryClient.setQueryData(['dashboard', 'preferences'], res.data)
      toast.success('Inicio personalizado')
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const toggle = (s: Section) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  const visible = available.filter((s) => !selected.has(s)).length

  return (
    <Modal open title="Personalizar Inicio" description="Elige qué secciones quieres ver" onClose={onClose}>
      <div className="space-y-4">
        <ul className="divide-y divide-border rounded-md border border-border">
          {available.map((s) => (
            <li key={s}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                <input type="checkbox" className="mt-1" checked={!selected.has(s)} onChange={() => toggle(s)} />
                <span>
                  <span className="block text-sm font-medium text-fg">{SECTION_LABELS[s].label}</span>
                  <span className="block text-xs text-fg-muted">{SECTION_LABELS[s].hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {visible === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">Inicio quedará solo con la banda.</p>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => save.mutate([])} disabled={save.isPending}>
            Restablecer
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate([...selected])}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default HomePage
