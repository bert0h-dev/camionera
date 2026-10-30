import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { localClock } from '../../lib/timezones'
import type { TripListItem, TripRouteOption, TripStatus, TripSummary } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'

/** Coordinación (y admin) gestiona los recorridos; supervisión y taquilla solo consultan. */
export function useCanManageTrips() {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'coordinator'
}

export const useTripSummary = (date: string) =>
  useQuery({
    queryKey: ['trips', 'summary', date],
    queryFn: async () => (await api.get<TripSummary>('/trips/summary', { params: { date } })).data,
  })

export const useTripRouteOptions = () =>
  useQuery({
    queryKey: ['trips', 'route-options'],
    queryFn: async () => (await api.get<TripRouteOption[]>('/trips/route-options')).data,
  })

export const TRIP_STATUS_TONES: Record<TripStatus, 'neutral' | 'info' | 'primary' | 'warning' | 'success' | 'danger'> =
  {
    scheduled: 'neutral',
    boarding: 'info',
    in_transit: 'primary',
    delayed: 'warning',
    completed: 'success',
    cancelled: 'danger',
  }

const dayKey = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))

/** Salida en hora del origen y llegada en hora del destino; `+1` si llega otro día. */
export function tripTimes(t: Pick<TripListItem, 'departureAt' | 'arrivalAt' | 'route'>) {
  const originTz = t.route.originTerminal.city.timezone
  const destinationTz = t.route.destinationTerminal.city.timezone
  const departure = localClock(originTz, new Date(t.departureAt))
  const arrival = localClock(destinationTz, new Date(t.arrivalAt))
  const days = Math.round(
    (Date.parse(`${dayKey(destinationTz, t.arrivalAt)}T00:00:00Z`) -
      Date.parse(`${dayKey(originTz, t.departureAt)}T00:00:00Z`)) /
      86400000,
  )
  return { departure, arrival, dayOffset: days, crossesZone: originTz !== destinationTz }
}
