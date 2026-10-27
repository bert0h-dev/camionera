import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { City, FuelType, Terminal, UserRole } from '../../lib/types'
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
