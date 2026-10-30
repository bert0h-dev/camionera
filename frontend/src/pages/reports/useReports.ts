import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { addDaysKey, todayKey } from '../../lib/format'
import type { SalesReport } from '../../lib/types'

export type Preset = 'today' | '7d' | 'month' | 'prev-month' | '30d' | 'custom'

export const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prev-month', label: 'Mes anterior' },
]

/** Periodo de un atajo, en días de la central. */
export function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = todayKey()
  const first = `${today.slice(0, 8)}01`
  switch (p) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDaysKey(today, -6), to: today }
    case '30d':
      return { from: addDaysKey(today, -29), to: today }
    case 'month':
      return { from: first, to: today }
    case 'prev-month': {
      const lastPrev = addDaysKey(first, -1)
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev }
    }
  }
}

export interface SalesFilters {
  from: string
  to: string
  routeId: string
  sellerId: string
  channel: string
}

export function useSalesReport(f: SalesFilters) {
  return useQuery({
    queryKey: ['reports', 'sales', f],
    queryFn: async () =>
      (
        await api.get<SalesReport>('/reports/sales', {
          params: {
            from: f.from,
            to: f.to,
            routeId: f.routeId || undefined,
            sellerId: f.sellerId || undefined,
            channel: f.channel || undefined,
          },
        })
      ).data,
  })
}
