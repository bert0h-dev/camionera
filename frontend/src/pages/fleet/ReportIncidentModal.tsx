import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import {
  BUS_STATUS_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_HINTS,
  INCIDENT_SEVERITY_LABELS,
  type Incident,
  type IncidentBusOption,
  type IncidentSeverity,
} from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { incidentFolio, useIncidentCategories } from './useFleet'

/** Fecha y hora local para <input type="datetime-local">. */
const toLocalInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export interface ReportPreset {
  busId?: string
  /** Si viene, el formulario edita esa incidencia */
  incident?: Incident
}

/** Alta o corrección de una incidencia; en accidentes pide los datos del siniestro. */
export function ReportIncidentModal({ preset, onClose }: { preset: ReportPreset | null; onClose: () => void }) {
  return (
    <Modal
      open={!!preset}
      title={preset?.incident ? `Editar ${incidentFolio(preset.incident.folio)}` : 'Reportar incidencia'}
      size="lg"
      onClose={onClose}
    >
      {preset && <IncidentForm key={preset.incident?.id ?? preset.busId ?? 'new'} preset={preset} onClose={onClose} />}
    </Modal>
  )
}

function IncidentForm({ preset, onClose }: { preset: ReportPreset; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const editing = preset.incident
  const [busId, setBusId] = useState(editing?.busId ?? preset.busId ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [severity, setSeverity] = useState<IncidentSeverity>(editing?.severity ?? 'medium')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [location, setLocation] = useState(editing?.location ?? '')
  // El momento de abrir el formulario es el valor por defecto y el máximo permitido
  const [now] = useState(() => toLocalInput(new Date()))
  const [occurredAt, setOccurredAt] = useState(() => (editing ? toLocalInput(new Date(editing.occurredAt)) : now))
  const [odometerKm, setOdometerKm] = useState(editing?.odometerKm?.toString() ?? '')
  const [claimNumber, setClaimNumber] = useState(editing?.claimNumber ?? '')
  const [insurer, setInsurer] = useState(editing?.insurer ?? '')
  const [thirdParties, setThirdParties] = useState(editing?.thirdParties ?? false)
  const [injuries, setInjuries] = useState(editing?.injuries ?? false)

  const buses = useQuery({
    queryKey: ['fleet', 'incidents', 'buses'],
    queryFn: async () => (await api.get<IncidentBusOption[]>('/fleet/incidents/buses')).data,
    enabled: !editing,
  })
  const categories = useIncidentCategories()
  const category = categories.data?.find((c) => c.id === categoryId) ?? editing?.category
  const isAccident = !!category?.isAccident
  const bus = buses.data?.find((b) => b.id === busId)

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        categoryId,
        severity,
        description,
        location,
        occurredAt: new Date(occurredAt).toISOString(),
        odometerKm: odometerKm ? Number(odometerKm) : null,
        ...(isAccident && { claimNumber, insurer, thirdParties, injuries }),
      }
      return editing
        ? (await api.patch<Incident>(`/fleet/incidents/${editing.id}`, body)).data
        : (await api.post<Incident>('/fleet/incidents', { ...body, busId })).data
    },
    onSuccess: (incident) => {
      toast.success(
        editing
          ? 'Incidencia actualizada'
          : incident.tookBusOut
            ? `${incidentFolio(incident.folio)} reportada: la unidad quedó fuera de servicio`
            : `${incidentFolio(incident.folio)} reportada`,
      )
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
      if (!editing) navigate(`/flota/incidencias/${incident.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {editing ? (
          <Input label="Unidad" value={`${editing.bus.economicNumber} · ${editing.bus.plates}`} disabled />
        ) : (
          <Select
            label="Unidad"
            required
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            hint={bus && bus.status !== 'available' ? BUS_STATUS_LABELS[bus.status] : undefined}
          >
            <option value="">Selecciona…</option>
            {buses.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.economicNumber} · {b.plates}
              </option>
            ))}
          </Select>
        )}
        <Select label="Categoría" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Selecciona…</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          label="Fecha y hora del suceso"
          type="datetime-local"
          required
          max={now}
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        <Input
          label="Odómetro (km)"
          type="number"
          min={0}
          className="font-data"
          hint="Opcional"
          value={odometerKm}
          onChange={(e) => setOdometerKm(e.target.value)}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg">Gravedad</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INCIDENT_SEVERITIES.map((s) => (
            <label
              key={s}
              className={cn(
                'cursor-pointer rounded-lg border px-3 py-2 text-sm',
                severity === s
                  ? s === 'critical'
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                    : 'border-primary bg-primary-soft text-primary-soft-fg'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="severity"
                className="sr-only"
                checked={severity === s}
                onChange={() => setSeverity(s)}
              />
              <span className="font-medium">{INCIDENT_SEVERITY_LABELS[s]}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">{INCIDENT_SEVERITY_HINTS[severity]}</p>
      </fieldset>

      {severity === 'critical' && !editing && (
        <Alert tone="warning">
          Al reportarla, la unidad pasa a <strong>fuera de servicio</strong> y no podrá salir hasta que se resuelva.
        </Alert>
      )}

      <Textarea
        label="¿Qué pasó?"
        required
        rows={3}
        placeholder="Describe la falla o el daño: qué se nota, desde cuándo, qué se hizo"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        label="Lugar"
        placeholder="Terminal, carretera y km, caseta…"
        hint="Opcional"
        maxLength={200}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      {isAccident && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-fg">Datos del siniestro</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="N.º de siniestro"
              className="font-data"
              maxLength={50}
              value={claimNumber}
              onChange={(e) => setClaimNumber(e.target.value)}
            />
            <Input
              label="Aseguradora o ajustador"
              maxLength={150}
              value={insurer}
              onChange={(e) => setInsurer(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={thirdParties}
                onChange={(e) => setThirdParties(e.target.checked)}
              />
              Hubo terceros involucrados
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={injuries}
                onChange={(e) => setInjuries(e.target.checked)}
              />
              Hubo lesionados
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant={severity === 'critical' && !editing ? 'danger' : 'primary'}
          loading={save.isPending}
          disabled={!busId || !categoryId || !occurredAt || description.trim().length < 5}
        >
          {editing ? 'Guardar cambios' : 'Reportar'}
        </Button>
      </div>
    </form>
  )
}
