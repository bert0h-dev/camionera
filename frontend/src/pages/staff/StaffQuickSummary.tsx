import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Coffee } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { dayLabel, formatTime } from '../../lib/format'
import { SHIFT_TYPE_LABELS, type StaffSummary } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'

function Tile({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={cn('font-data mt-1 text-2xl font-bold text-fg', tone)}>
        {value}
        {suffix && <span className="ml-1 text-sm font-medium text-fg-muted">{suffix}</span>}
      </div>
    </div>
  )
}

/** Indicadores rápidos de la ficha: asistencia del mes, horas de la semana, evaluación y licencia. */
export function StaffQuickStats({ staffId }: { staffId: string }) {
  const { data } = useStaffSummary(staffId)
  if (!data)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )

  const rate = data.attendance.rate
  const overHours = data.week.hours > data.week.max
  const score = data.lastEvaluation?.score == null ? null : Number(data.lastEvaluation.score)
  const lic = data.license
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Asistencia del mes"
        value={rate === null ? '—' : `${rate}%`}
        tone={
          rate === null
            ? undefined
            : rate >= 95
              ? 'text-emerald-600 dark:text-emerald-400'
              : rate >= 85
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
        }
      />
      <Tile
        label="Horas esta semana"
        value={String(data.week.hours)}
        suffix={`/ ${data.week.max} h`}
        tone={overHours ? 'text-red-600 dark:text-red-400' : undefined}
      />
      <Tile
        label="Última evaluación"
        value={score === null ? '—' : score.toFixed(2)}
        tone={
          score === null
            ? undefined
            : score >= 4
              ? 'text-emerald-600 dark:text-emerald-400'
              : score >= 3
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
        }
      />
      <Tile
        label={lic ? `Licencia tipo ${lic.type}` : 'Licencia'}
        value={
          lic ? (lic.daysToExpiry! < 0 ? 'Vencida' : String(lic.daysToExpiry)) : data.requiresLicense ? 'Falta' : '—'
        }
        suffix={lic && lic.daysToExpiry! >= 0 ? 'días' : undefined}
        tone={
          lic?.status === 'expired' || (!lic && data.requiresLicense)
            ? 'text-red-600 dark:text-red-400'
            : lic && lic.daysToExpiry! <= 30
              ? 'text-amber-600 dark:text-amber-400'
              : undefined
        }
      />
    </div>
  )
}

/** Próximos turnos del empleado. */
export function NextShiftsCard({ staffId }: { staffId: string }) {
  const { data } = useStaffSummary(staffId)
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarClock className="size-4 text-fg-subtle" />
            Próximos turnos
          </span>
        }
      />
      <CardBody className="space-y-2">
        {!data ? (
          <Skeleton className="h-28 w-full" />
        ) : data.nextShifts.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin turnos programados.</p>
        ) : (
          data.nextShifts.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                s.isRestDay ? 'bg-surface-sunken text-fg-muted' : 'bg-primary-soft text-fg',
              )}
            >
              <span className="font-data w-20 shrink-0 text-xs font-bold text-primary-soft-fg uppercase">
                {dayLabel(s.scheduleDate.slice(0, 10))}
              </span>
              {s.isRestDay ? (
                <span className="flex items-center gap-1.5">
                  <Coffee className="size-3.5" /> Descanso
                </span>
              ) : (
                <span>
                  <span className="font-data">
                    {formatTime(s.startAt)}–{formatTime(s.endAt)}
                  </span>
                  {s.shiftType && <span className="text-fg-muted"> · {SHIFT_TYPE_LABELS[s.shiftType]}</span>}
                </span>
              )}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  )
}

function useStaffSummary(staffId: string) {
  return useQuery({
    queryKey: ['staff', staffId, 'summary'],
    queryFn: async () => (await api.get<StaffSummary>(`/staff/${staffId}/summary`)).data,
  })
}
