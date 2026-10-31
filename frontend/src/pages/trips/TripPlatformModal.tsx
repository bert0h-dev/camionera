import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { formatTime } from '../../lib/format'
import type { TripDetail, TripPlatformOptions } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'

/** Andén de salida; los ocupados en la ventana de abordaje solo los fuerza un admin con motivo. */
export function TripPlatformModal({ trip, open, onClose }: { trip: TripDetail; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const [platformId, setPlatformId] = useState(trip.platformId ?? '')
  const [reason, setReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['trips', 'platforms', trip.id],
    enabled: open,
    queryFn: async () => (await api.get<TripPlatformOptions>(`/trips/${trip.id}/platforms`)).data,
  })

  const selected = data?.platforms.find((p) => p.id === platformId)
  // Lo que ya tenía asignado se respeta aunque ahora choque
  const conflicts = selected && platformId !== trip.platformId ? selected.conflicts : []
  const needsOverride = conflicts.length > 0

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/trips/${trip.id}/platform`, {
        platformId: platformId || null,
        overrideReason: needsOverride ? reason : undefined,
      }),
    onSuccess: () => {
      toast.success('Andén guardado')
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const invalid = platformId === (trip.platformId ?? '') || (needsOverride && (!isAdmin || !reason.trim()))

  return (
    <Modal
      open={open}
      title={`Andén de ${trip.tripNumber}`}
      description={
        data
          ? `Un andén se ocupa desde ${data.boardingMinutes} min antes de la salida; los ocupados se marcan`
          : undefined
      }
      onClose={onClose}
    >
      {error ? (
        <Alert tone="danger">{apiErrorMessage(error, 'No se pudieron cargar los andenes')}</Alert>
      ) : isLoading || !data ? (
        <LoadingBlock text="Revisando andenes…" />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {!data.platforms.length ? (
            <Alert tone="warning">
              {trip.route.originTerminal.code} no tiene andenes; dalos de alta en Flota › Catálogos › Terminales.
            </Alert>
          ) : (
            <div>
              <Select label="Andén" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                <option value="">Sin andén</option>
                {data.platforms.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.isActive && p.id !== trip.platformId}>
                    Andén {p.code}
                    {p.name ? ` · ${p.name}` : ''}
                    {p.conflicts.length && p.id !== trip.platformId
                      ? ` — ocupado por ${p.conflicts.map((c) => `${c.tripNumber} (${formatTime(c.departureAt)})`).join(', ')}`
                      : ''}
                  </option>
                ))}
              </Select>
              {needsOverride && (
                <p className="mt-1.5 text-xs text-orange-600 dark:text-orange-400">
                  Ocupado por {conflicts.map((c) => `${c.tripNumber} (sale ${formatTime(c.departureAt)})`).join(', ')}
                </p>
              )}
            </div>
          )}

          {needsOverride &&
            (isAdmin ? (
              <Textarea
                label="Motivo para usar un andén ocupado"
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            ) : (
              <Alert tone="warning">El andén está ocupado. Solo un administrador puede forzarlo con un motivo.</Alert>
            ))}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={invalid}>
              Guardar andén
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
