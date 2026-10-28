import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  BusSummary,
  City,
  FuelType,
  IncidentCategory,
  IncidentSummary,
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

export const useBusSummary = (enabled = true) =>
  useQuery({
    queryKey: ['fleet', 'buses', 'summary'],
    enabled,
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

export const useMaintenanceSummary = (enabled = true) =>
  useQuery({
    queryKey: ['fleet', 'maintenance', 'summary'],
    enabled,
    queryFn: async () => (await api.get<MaintenanceSummary>('/fleet/maintenance/summary')).data,
  })

/** Folio legible de una incidencia: INC-000123 */
export const incidentFolio = (n: number) => `INC-${String(n).padStart(6, '0')}`

/**
 * Coordinación, supervisión y admin revisan y cierran todas las incidencias;
 * solo coordinación (y admin) crea la orden correctiva y edita categorías.
 * El conductor y el mecánico reportan y ven solo las suyas.
 */
export function useIncidentRole() {
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'coordinator'
  const canReview = canManage || user?.role === 'supervisor'
  return { canManage, canReview, isReporterOnly: !canReview }
}

export const useIncidentCategories = (includeInactive = false) =>
  useQuery({
    queryKey: ['fleet', 'incidents', 'categories', includeInactive],
    queryFn: async () =>
      (await api.get<IncidentCategory[]>('/fleet/incidents/categories', { params: { includeInactive } })).data,
  })

export const useIncidentSummary = (enabled = true) =>
  useQuery({
    queryKey: ['fleet', 'incidents', 'summary'],
    enabled,
    queryFn: async () => (await api.get<IncidentSummary>('/fleet/incidents/summary')).data,
  })

export const useServicePlan = (enabled = true) =>
  useQuery({
    queryKey: ['fleet', 'maintenance', 'plan'],
    queryFn: async () => (await api.get<ServicePlanRow[]>('/fleet/maintenance/plan')).data,
    enabled,
  })
