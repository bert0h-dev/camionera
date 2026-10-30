import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { todayKey } from '../../lib/format'
import { arrivalLabel } from '../../lib/timezones'
import type { TripListItem } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useTripRouteOptions } from './useTrips'

/** Recorrido fuera de horario: refuerzo o servicio especial. */
export function ExtraTripModal({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const routes = useTripRouteOptions()
  const [routeId, setRouteId] = useState('')
  const [day, setDay] = useState(date < todayKey() ? todayKey() : date)
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const route = routes.data?.find((r) => r.id === routeId)

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<TripListItem>('/trips/extra', { routeId, date: day, departureTime: time, notes: notes || null }))
        .data,
    onSuccess: (trip) => {
      toast.success(`Recorrido extra ${trip.tripNumber} creado`)
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      onClose()
      navigate(`/recorridos/${trip.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const hint = !route
    ? undefined
    : time
      ? `Hora de ${route.originTerminal.city.name} · llega ${arrivalLabel(
          time,
          route.estimatedDurationMinutes,
          route.originTerminal.city.timezone,
          route.destinationTerminal.city.timezone,
          day,
        )} hora de ${route.destinationTerminal.city.name}`
      : `Hora local de ${route.originTerminal.city.name}`

  return (
    <Modal
      open={open}
      title="Recorrido extra"
      description="Un refuerzo o servicio especial fuera de los horarios de la ruta"
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Select label="Ruta" required value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">Elige una ruta…</option>
          {routes.data
            ?.filter((r) => r.isActive)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Fecha de salida"
            type="date"
            required
            min={todayKey()}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <Input
            label="Hora de salida"
            type="time"
            required
            className="font-data"
            hint={hint}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <Textarea
          label="Motivo"
          rows={2}
          placeholder="Refuerzo por puente, viaje especial…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!routeId || !day || !time}>
            Crear recorrido
          </Button>
        </div>
      </form>
    </Modal>
  )
}
