import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  BusSummary,
  City,
  FuelType,
  MaintenanceSummary,
  ServicePlanRow,
  Terminal,
  UserRole,
} from '../../lib/types'
import { useAuth } from '../../auth/useAuth'

export const FLEET_READERS: UserRole[] = ['coordinator', 'supervisor']

/** Coordinación (y admin) administra la flota; el supervisor solo consulta. */
export function useCanEditFleet() {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'coordinator'
}

export const useFuelTypes = (includeInactive = false) =>
  useQuery({
    queryKey: ['fleet', 'fuel-types', includeInactive],
    queryFn: async () => (await api.get<FuelType[]>('/fleet/fuel-types', { params: { includeInactive } })).data,
  })

export const useCities = (includeInactive = false) =>
  useQuery({
    queryKey: ['fleet', 'cities', includeInactive],
    queryFn: async () => (await api.get<City[]>('/fleet/cities', { params: { includeInactive } })).data,
  })

export const useTerminals = (includeInactive = false) =>
  useQuery({
    queryKey: ['fleet', 'terminals', includeInactive],
    queryFn: async () => (await api.get<Terminal[]>('/fleet/terminals', { params: { includeInactive } })).data,
  })

export const useBusSummary = () =>
  useQuery({
    queryKey: ['fleet', 'buses', 'summary'],
    queryFn: async () => (await api.get<BusSummary>('/fleet/buses/summary')).data,
  })

/** Folio legible de una orden: OT-000123 */
export const orderFolio = (n: number) => `OT-${String(n).padStart(6, '0')}`

/** El mecánico trabaja órdenes (iniciar, tareas, terminar) pero no las crea ni cancela. */
export function useMaintenanceRole() {
  const { user } = useAuth()
  const isMechanic = user?.role === 'mechanic'
  const canManage = user?.role === 'admin' || user?.role === 'coordinator'
  return { isMechanic, canManage, canWork: canManage || isMechanic }
}

export const useMaintenanceSummary = () =>
  useQuery({
    queryKey: ['fleet', 'maintenance', 'summary'],
    queryFn: async () => (await api.get<MaintenanceSummary>('/fleet/maintenance/summary')).data,
  })

export const useServicePlan = (enabled = true) =>
  useQuery({
    queryKey: ['fleet', 'maintenance', 'plan'],
    queryFn: async () => (await api.get<ServicePlanRow[]>('/fleet/maintenance/plan')).data,
    enabled,
  })
