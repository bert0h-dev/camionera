import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api, apiErrorMessage } from '../../lib/api'
import { dayLabel, formatMinutes, formatTime } from '../../lib/format'
import type { MyToday } from '../../lib/types'
import { AttendanceStatusBadge } from '../../components/AttendanceStatusBadge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toast-context'

/** "Mi turno de hoy" con autoregistro. Solo aparece si el usuario está ligado a un empleado. */
export function MyShiftCard() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', 'me'],
    queryFn: async () => (await api.get<MyToday>('/attendance/me/today')).data,
    retry: false,
    refetchInterval: 60_000,
  })

  const action = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') => api.post(`/attendance/me/${kind}`),
    onSuccess: (_r, kind) => {
      toast.success(kind === 'check-in' ? 'Entrada registrada' : 'Salida registrada')
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  // Usuarios sin empleado ligado (por ejemplo el admin) no ven la tarjeta
  if ((error as AxiosError | null)?.response?.status === 404) return null
  if (isLoading || !data) return null

  const { schedule, attendance } = data
  const checkedIn = !!attendance?.checkInAt
  const checkedOut = !!attendance?.checkOutAt

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-semibold text-fg">Mi turno</h2>
      {schedule ? (
        <p className="mt-1 text-fg">
          {dayLabel(schedule.scheduleDate.slice(0, 10))} ·{' '}
          <strong>
            {formatTime(schedule.startAt)}–{formatTime(schedule.endAt)}
          </strong>
        </p>
      ) : (
        <p className="mt-1 text-sm text-fg-muted">No tienes turno programado por ahora.</p>
      )}

      {attendance && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-fg">
          <AttendanceStatusBadge status={attendance.status} />
          {checkedIn && <span>Entrada: {formatTime(attendance.checkInAt)}</span>}
          {checkedOut && <span>Salida: {formatTime(attendance.checkOutAt)}</span>}
          {attendance.lateMinutes > 0 && (
            <span className="text-amber-700 dark:text-amber-300">Retardo: {formatMinutes(attendance.lateMinutes)}</span>
          )}
        </div>
      )}

      {(schedule || (checkedIn && !checkedOut)) && !checkedOut && (
        <div className="mt-4">
          {checkedIn ? (
            <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate('check-out')}>
              Registrar salida
            </Button>
          ) : (
            <Button loading={action.isPending} onClick={() => action.mutate('check-in')}>
              Registrar entrada
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
