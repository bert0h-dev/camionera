import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { todayKey } from '../../lib/format'
import { arrivalLabel, zoneGapLabel } from '../../lib/timezones'
import type { RouteDetail, RouteScheduleRow } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { usePlatforms } from '../fleet/useFleet'
import { DAY_NAMES, DAY_PRESETS, DAY_SHORT, WEEK_ORDER } from './useRoutes'

interface Draft {
  times: string[]
  days: number[]
  validFrom: string
  validUntil: string
  platformId: string
}

const toDraft = (s: RouteScheduleRow | null): Draft =>
  s
    ? {
        times: [s.departureTime],
        days: s.daysOfWeek,
        validFrom: s.validFrom,
        validUntil: s.validUntil ?? '',
        platformId: s.platformId ?? '',
      }
    : { times: [''], days: [1, 2, 3, 4, 5], validFrom: todayKey(), validUntil: '', platformId: '' }

/**
 * Alta de una o varias salidas con los mismos días y vigencia, o edición de una.
 * `schedule` = null abre el alta; undefined lo cierra.
 */
export function ScheduleModal({
  route,
  schedule,
  onClose,
}: {
  route: RouteDetail
  schedule: RouteScheduleRow | null | undefined
  onClose: () => void
}) {
  const editing = !!schedule
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(schedule ?? null))
  const [prev, setPrev] = useState(schedule)
  if (prev !== schedule) {
    setPrev(schedule)
    setDraft(toDraft(schedule ?? null))
  }
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const platforms = usePlatforms(route.originTerminal.id)
  const originTz = route.originTerminal.city.timezone
  const destinationTz = route.destinationTerminal.city.timezone
  const crossesZone = originTz !== destinationTz
  const times = draft.times.filter(Boolean)
  const repeated = times.length !== new Set(times).size
  // La llegada de ejemplo usa el primer día de vigencia (o hoy) para tomar el horario de verano correcto
  const reference = draft.validFrom > todayKey() ? draft.validFrom : todayKey()
  const arrival = (t: string) =>
    arrivalLabel(t, route.estimatedDurationMinutes, originTz, destinationTz, reference || todayKey())

  const toggleDay = (d: number) =>
    set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d] })

  const save = useMutation({
    mutationFn: async () => {
      const base = `/routes/${route.id}/schedules`
      const fields = {
        daysOfWeek: draft.days,
        validFrom: draft.validFrom,
        validUntil: draft.validUntil || null,
        platformId: draft.platformId || null,
      }
      if (schedule) await api.patch(`${base}/${schedule.id}`, { departureTime: times[0], ...fields })
      else await api.post(base, { departureTimes: times, ...fields })
    },
    onSuccess: () => {
      toast.success(
        editing ? 'Horario actualizado' : times.length > 1 ? `${times.length} salidas agregadas` : 'Salida agregada',
      )
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const invalid = !times.length || repeated || !draft.days.length || !draft.validFrom

  return (
    <Modal
      open={schedule !== undefined}
      title={editing ? `Editar salida de las ${schedule?.departureTime}` : 'Agregar salidas'}
      description={`Horas en hora local de ${route.originTerminal.city.name}`}
      size="lg"
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="space-y-2">
          <span className="block text-sm font-medium text-fg">
            {editing ? 'Hora de salida' : 'Horas de salida'} <span className="text-red-600 dark:text-red-400">*</span>
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  required
                  aria-label={`Hora de salida ${i + 1}`}
                  className="font-data"
                  value={t}
                  onChange={(e) => set({ times: draft.times.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <span className="w-28 shrink-0 text-xs text-fg-muted">
                  {t ? (
                    <>
                      llega <span className="font-data text-fg">{arrival(t)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {draft.times.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={X}
                    aria-label="Quitar hora"
                    onClick={() => set({ times: draft.times.filter((_, j) => j !== i) })}
                  />
                )}
              </div>
            ))}
          </div>
          {!editing && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => set({ times: [...draft.times, ''] })}>
              Otra hora
            </Button>
          )}
          {repeated && <p className="text-xs text-red-600 dark:text-red-400">Hay horas repetidas</p>}
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-fg">
            Días <span className="text-red-600 dark:text-red-400">*</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {WEEK_ORDER.map((d) => {
              const on = draft.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  title={DAY_NAMES[d]}
                  aria-pressed={on}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'size-9 rounded-full text-sm font-semibold ring-1 transition-colors',
                    on
                      ? 'bg-primary text-primary-fg ring-primary'
                      : 'bg-surface text-fg-muted ring-border hover:text-fg',
                  )}
                >
                  {DAY_SHORT[d]}
                </button>
              )
            })}
            <span className="mx-1 h-6 w-px bg-border" />
            {DAY_PRESETS.map((p) => (
              <Button key={p.label} variant="ghost" size="sm" onClick={() => set({ days: p.days })}>
                {p.label}
              </Button>
            ))}
          </div>
          {!draft.days.length && <p className="text-xs text-red-600 dark:text-red-400">Elige al menos un día</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Vigente desde"
            type="date"
            required
            value={draft.validFrom}
            onChange={(e) => set({ validFrom: e.target.value })}
          />
          <Input
            label="Vigente hasta"
            type="date"
            min={draft.validFrom}
            hint="Vacío = sin fecha de fin"
            value={draft.validUntil}
            onChange={(e) => set({ validUntil: e.target.value })}
          />
        </div>

        <Select
          label="Andén habitual"
          hint={
            platforms.data && !platforms.data.length
              ? `${route.originTerminal.code} no tiene andenes; dalos de alta en Flota › Catálogos`
              : 'Los recorridos que se generen saldrán de este andén; se puede cambiar en cada recorrido'
          }
          value={draft.platformId}
          onChange={(e) => set({ platformId: e.target.value })}
        >
          <option value="">Sin andén</option>
          {(platforms.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              Andén {p.code}
              {p.name ? ` · ${p.name}` : ''}
            </option>
          ))}
        </Select>

        {crossesZone && (
          <Alert tone="info">
            La llegada se muestra en hora de {route.destinationTerminal.city.name}:{' '}
            {zoneGapLabel(originTz, destinationTz, route.destinationTerminal.city.name)}.
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={invalid}>
            {editing ? 'Guardar' : times.length > 1 ? `Agregar ${times.length} salidas` : 'Agregar salida'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
