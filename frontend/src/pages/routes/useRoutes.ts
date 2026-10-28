import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { RouteDetail, RouteScheduleRow, RouteSummary, RouteTerminal, Terminal } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'

/** Coordinación (y admin) administra las rutas; supervisión y taquilla solo consultan. */
export function useCanEditRoutes() {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'coordinator'
}

export const useRouteSummary = () =>
  useQuery({
    queryKey: ['routes', 'summary'],
    queryFn: async () => (await api.get<RouteSummary>('/routes/summary')).data,
  })

export const useRoute = (id: string) =>
  useQuery({
    queryKey: ['routes', 'detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<RouteDetail>(`/routes/${id}`)).data,
  })

/** Terminales activas con ubicación: las únicas que pueden ser origen o destino. */
export const useRouteTerminals = (enabled = true) =>
  useQuery({
    queryKey: ['routes', 'form-options'],
    enabled,
    queryFn: async () => (await api.get<Terminal[]>('/routes/form-options')).data,
  })

/** 'GDL → CDMXN' */
export const routeEnds = (r: { originTerminal: RouteTerminal; destinationTerminal: RouteTerminal }) =>
  `${r.originTerminal.code} → ${r.destinationTerminal.code}`

export const formatKm = (km: number | string) =>
  `${Number(km).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km`

export const useRouteSchedules = (routeId: string) =>
  useQuery({
    queryKey: ['routes', 'schedules', routeId],
    queryFn: async () => (await api.get<RouteScheduleRow[]>(`/routes/${routeId}/schedules`)).data,
  })

// 0 = domingo; la semana se muestra de lunes a domingo
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export const DAY_PRESETS = [
  { label: 'Diario', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Lunes a viernes', days: [1, 2, 3, 4, 5] },
  { label: 'Fin de semana', days: [0, 6] },
]

/** 'Diario', 'Lunes a viernes', 'Fin de semana' o 'L, M, V' */
export function daysText(days: number[]) {
  const key = [...days].sort().join()
  const preset = DAY_PRESETS.find((p) => [...p.days].sort().join() === key)
  return preset
    ? preset.label
    : WEEK_ORDER.filter((d) => days.includes(d))
        .map((d) => DAY_NAMES[d].slice(0, 3))
        .join(', ')
}
