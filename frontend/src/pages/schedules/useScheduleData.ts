import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Schedule, ShiftTemplate } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'

export function useShiftTemplates(includeInactive = false) {
  return useQuery({
    queryKey: ['shift-templates', { includeInactive }],
    queryFn: async () =>
      (await api.get<ShiftTemplate[]>('/shift-templates', { params: { all: includeInactive || undefined } })).data,
  })
}

export function useSchedules(params: { from: string; to: string; staffId?: string; role?: string }) {
  return useQuery({
    queryKey: ['schedules', params],
    queryFn: async () => (await api.get<Schedule[]>('/schedules', { params })).data,
  })
}

/** Admin, RRHH y supervisor programan turnos; coordinador solo consulta. */
export function useCanSchedule() {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'hr' || user?.role === 'supervisor'
}
