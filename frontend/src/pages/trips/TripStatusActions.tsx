import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Clock, DoorOpen, Play, type LucideIcon } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { TripListItem, TripStatus } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

// Misma tabla que backend/src/trips/status-rules.ts
const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  scheduled: ['boarding', 'delayed', 'cancelled'],
  boarding: ['in_transit', 'delayed', 'cancelled'],
  in_transit: ['completed', 'delayed'],
  delayed: ['boarding', 'in_transit', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const ACTIONS: Record<
  Exclude<TripStatus, 'scheduled'>,
  { label: string; icon: LucideIcon; variant: 'accent' | 'glass' | 'primary' | 'secondary' | 'danger' }
> = {
  boarding: { label: 'Abrir abordaje', icon: DoorOpen, variant: 'primary' },
  in_transit: { label: 'Registrar salida', icon: Play, variant: 'primary' },
  completed: { label: 'Registrar llegada', icon: CheckCircle2, variant: 'primary' },
  delayed: { label: 'Marcar retraso', icon: Clock, variant: 'secondary' },
  cancelled: { label: 'Cancelar', icon: Ban, variant: 'danger' },
}

type TripLike = Pick<TripListItem, 'id' | 'tripNumber' | 'status' | 'busId' | 'driverId'> & {
  actualDepartureAt?: string | null
  bus: TripListItem['bus']
}

/** Cambios de estado que este usuario puede hacer sobre el recorrido, en el orden en que se usan. */
function useTripTransitions(trip: TripLike) {
  const { user } = useAuth()
  const departed = !!trip.actualDepartureAt
  const isDriver = user?.role === 'driver'
  return TRANSITIONS[trip.status].filter((to) => {
    if (isDriver && to === 'cancelled') return false
    // Un retraso en ruta solo sigue o termina; antes de salir vuelve a abordar o se cancela
    if (trip.status === 'delayed') {
      if (departed) return to === 'in_transit' || to === 'completed'
      return to !== 'completed'
    }
    return true
  }) as Exclude<TripStatus, 'scheduled'>[]
}

/**
 * Botones de estado. `glass` en la banda de la ficha; normales en las tarjetas del conductor.
 * Retrasar y cancelar piden motivo; salir pide el odómetro (opcional) y llegar lo exige.
 */
export function TripStatusActions({ trip, inBand = false }: { trip: TripLike; inBand?: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const options = useTripTransitions(trip)
  const [target, setTarget] = useState<Exclude<TripStatus, 'scheduled'> | null>(null)
  const [reason, setReason] = useState('')
  const [km, setKm] = useState('')
  const departing = target === 'in_transit' && !trip.actualDepartureAt

  const close = () => {
    setTarget(null)
    setReason('')
    setKm('')
  }

  const change = useMutation({
    mutationFn: async (to: TripStatus) =>
      (
        await api.patch<{ message: string }>(`/trips/${trip.id}/status`, {
          status: to,
          reason: reason || null,
          startOdometerKm: to === 'in_transit' && km ? Number(km) : undefined,
          endOdometerKm: to === 'completed' && km ? Number(km) : undefined,
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.message)
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      close()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (!options.length) return null
  // Abordar sin capturas va directo; lo demás abre el diálogo
  const start = (to: Exclude<TripStatus, 'scheduled'>) => (to === 'boarding' ? change.mutate(to) : setTarget(to))

  const needsReason = target === 'delayed' || target === 'cancelled'
  const invalid = (needsReason && !reason.trim()) || (target === 'completed' && !km)

  return (
    <>
      {options.map((to) => {
        const a = ACTIONS[to]
        return (
          <Button
            key={to}
            icon={a.icon}
            variant={inBand ? (to === 'cancelled' || to === 'delayed' ? 'glass' : 'accent') : a.variant}
            size={inBand ? 'md' : 'sm'}
            loading={change.isPending && change.variables === to}
            onClick={() => start(to)}
          >
            {a.label}
          </Button>
        )
      })}

      <Modal
        open={target !== null}
        title={target ? `${ACTIONS[target].label} · ${trip.tripNumber}` : ''}
        description={
          target === 'cancelled'
            ? 'Libera la unidad y al personal; en el Módulo 6 también cancelará los boletos'
            : target === 'completed'
              ? 'La unidad regresa a disponible y se registra su odómetro'
              : departing
                ? 'Se registra la hora real de salida y la unidad pasa a en servicio'
                : undefined
        }
        size="sm"
        onClose={close}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (target) change.mutate(target)
          }}
        >
          {(departing || target === 'completed') && trip.bus && (
            <Input
              label={departing ? 'Odómetro de salida (opcional)' : 'Odómetro de llegada'}
              type="number"
              min={0}
              inputMode="numeric"
              className="font-data"
              required={target === 'completed'}
              hint={`Unidad ${trip.bus.economicNumber} · en km`}
              value={km}
              onChange={(e) => setKm(e.target.value)}
            />
          )}
          {needsReason && (
            <Textarea
              label={target === 'cancelled' ? 'Motivo de la cancelación' : 'Motivo del retraso'}
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Volver
            </Button>
            <Button
              type="submit"
              variant={target === 'cancelled' ? 'danger' : 'primary'}
              loading={change.isPending}
              disabled={invalid}
            >
              {target ? ACTIONS[target].label : ''}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
