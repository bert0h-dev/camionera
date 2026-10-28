import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { RouteDetail, RouteSummary, RouteTerminal, Terminal } from '../../lib/types'
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
