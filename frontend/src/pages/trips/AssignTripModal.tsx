import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { staffFullName } from '../../lib/format'
import type { AssignmentIssue, TripCandidates, TripDetail } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'

const blocked = (issues: AssignmentIssue[]) => issues.some((i) => i.level === 'block')
const forced = (issues: AssignmentIssue[]) => issues.some((i) => i.level === 'override')

/** Texto de la opción: los no aptos dicen por qué (la primera razón). */
function optionLabel(name: string, issues: AssignmentIssue[]) {
  const first = issues.find((i) => i.level === 'block') ?? issues.find((i) => i.level === 'override')
  return first ? `${name} — ${first.message}` : name
}

function Issues({ issues }: { issues: AssignmentIssue[] }) {
  if (!issues.length) return null
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs">
      {issues.map((i) => (
        <li
          key={i.message}
          className={
            i.level === 'block'
              ? 'text-red-600 dark:text-red-400'
              : i.level === 'override'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-amber-700 dark:text-amber-300'
          }
        >
          {i.level === 'warn' ? 'Aviso: ' : ''}
          {i.message}
        </li>
      ))}
    </ul>
  )
}

/** Unidad, conductor y cobrador; las opciones vienen con sus observaciones para este recorrido. */
export function AssignTripModal({ trip, open, onClose }: { trip: TripDetail; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const [busId, setBusId] = useState(trip.busId ?? '')
  const [driverId, setDriverId] = useState(trip.driverId ?? '')
  const [collectorId, setCollectorId] = useState(trip.collectorId ?? '')
  const [reason, setReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['trips', 'candidates', trip.id],
    enabled: open,
    queryFn: async () => (await api.get<TripCandidates>(`/trips/${trip.id}/candidates`)).data,
  })

  // Las observaciones solo cuentan para lo que cambia; lo ya asignado se respeta
  const issuesOf = <T extends { id: string; issues: AssignmentIssue[] }>(
    list: T[] | undefined,
    id: string,
    current: string | null,
  ) => (id && id !== current ? (list?.find((x) => x.id === id)?.issues ?? []) : [])
  const busIssues = issuesOf(data?.buses, busId, trip.busId)
  const driverIssues = issuesOf(data?.drivers, driverId, trip.driverId)
  const collectorIssues = issuesOf(data?.collectors, collectorId, trip.collectorId)
  const all = [...busIssues, ...driverIssues, ...collectorIssues]
  const needsOverride = forced(all)
  const samePerson = !!collectorId && collectorId === driverId

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<{ warnings: AssignmentIssue[] }>(`/trips/${trip.id}/assignment`, {
          busId: busId || null,
          driverId: driverId || null,
          collectorId: collectorId || null,
          overrideReason: needsOverride ? reason : undefined,
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.warnings.length ? `Asignación guardada con ${r.warnings.length} aviso(s)` : 'Asignación guardada')
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const invalid = blocked(all) || samePerson || (needsOverride && (!isAdmin || !reason.trim()))

  return (
    <Modal
      open={open}
      title={`Asignar ${trip.tripNumber}`}
      description="Solo se ofrecen como aptos los que están disponibles en ese horario"
      size="lg"
      onClose={onClose}
    >
      {error ? (
        <Alert tone="danger">{apiErrorMessage(error, 'No se pudieron cargar las opciones')}</Alert>
      ) : isLoading || !data ? (
        <LoadingBlock text="Revisando disponibilidad…" />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div>
            <Select label="Unidad" value={busId} onChange={(e) => setBusId(e.target.value)}>
              <option value="">Sin unidad</option>
              {data.buses.map((b) => (
                <option key={b.id} value={b.id} disabled={b.id !== trip.busId && blocked(b.issues)}>
                  {optionLabel(`${b.economicNumber} · ${b.model} · ${b.seats} asientos`, b.issues)}
                </option>
              ))}
            </Select>
            <Issues issues={busIssues} />
          </div>
          <div>
            <Select label="Conductor" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Sin conductor</option>
              {data.drivers.map((d) => (
                <option key={d.id} value={d.id} disabled={d.id !== trip.driverId && blocked(d.issues)}>
                  {optionLabel(`${staffFullName(d)} · ${d.employeeNumber}`, d.issues)}
                </option>
              ))}
            </Select>
            <Issues issues={driverIssues} />
          </div>
          <div>
            <Select label="Cobrador (opcional)" value={collectorId} onChange={(e) => setCollectorId(e.target.value)}>
              <option value="">Sin cobrador</option>
              {data.collectors.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id !== trip.collectorId && blocked(c.issues)}>
                  {optionLabel(`${staffFullName(c)} · ${c.employeeNumber}`, c.issues)}
                </option>
              ))}
            </Select>
            <Issues issues={collectorIssues} />
          </div>

          {samePerson && <Alert tone="danger">El conductor y el cobrador deben ser personas distintas.</Alert>}
          {needsOverride &&
            (isAdmin ? (
              <Textarea
                label="Motivo para pasar el límite de horas"
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            ) : (
              <Alert tone="warning">
                Pasa el límite de horas de manejo del día. Solo un administrador puede forzarlo con un motivo.
              </Alert>
            ))}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={invalid}>
              Guardar asignación
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
