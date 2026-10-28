import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import { BUS_STATUS_LABELS, type FuelFormOptions, type FuelLoad } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useFuelRole } from './useFleet'

/** Fecha y hora local para <input type="datetime-local">. */
const toLocalInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export interface FuelPreset {
  busId?: string
  /** Si viene, el formulario corrige esa carga */
  load?: FuelLoad
}

/** Registro o corrección de una carga de combustible. */
export function FuelLoadModal({ preset, onClose }: { preset: FuelPreset | null; onClose: () => void }) {
  return (
    <Modal open={!!preset} title={preset?.load ? 'Corregir carga' : 'Registrar carga'} size="lg" onClose={onClose}>
      {preset && <FuelForm key={preset.load?.id ?? preset.busId ?? 'new'} preset={preset} onClose={onClose} />}
    </Modal>
  )
}

function FuelForm({ preset, onClose }: { preset: FuelPreset; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { canManage } = useFuelRole()
  const editing = preset.load
  const [busId, setBusId] = useState(editing?.busId ?? preset.busId ?? '')
  const [now] = useState(() => toLocalInput(new Date()))
  const [loadedAt, setLoadedAt] = useState(() => (editing ? toLocalInput(new Date(editing.loadedAt)) : now))
  const [quantity, setQuantity] = useState(editing ? String(Number(editing.quantity)) : '')
  // null = aún no lo tocan: se propone el último precio usado del combustible
  const [unitPrice, setUnitPrice] = useState<string | null>(editing ? String(Number(editing.unitPrice)) : null)
  const [odometerKm, setOdometerKm] = useState(editing?.odometerKm.toString() ?? '')
  const [isFullTank, setIsFullTank] = useState(editing?.isFullTank ?? true)
  const [station, setStation] = useState(editing?.station ?? '')
  const [ticket, setTicket] = useState(editing?.ticket ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const options = useQuery({
    queryKey: ['fleet', 'fuel', 'form-options'],
    queryFn: async () => (await api.get<FuelFormOptions>('/fleet/fuel/form-options')).data,
  })
  const bus = options.data?.buses.find((b) => b.id === busId)
  const fuel = bus?.busModel.fuelType ?? editing?.fuelType
  const lastPrice = options.data?.lastPrices.find((p) => p.fuelTypeId === fuel?.id)
  const price = unitPrice ?? (lastPrice ? String(Number(lastPrice.unitPrice)) : '')
  const tank = bus?.busModel.tankCapacity ? Number(bus.busModel.tankCapacity) : null
  const total = Number(quantity) * Number(price)
  const goesToReview = !editing && !canManage

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        loadedAt: new Date(loadedAt).toISOString(),
        quantity: Number(quantity),
        unitPrice: Number(price),
        odometerKm: Number(odometerKm),
        isFullTank,
        station,
        ticket,
        notes,
      }
      return editing
        ? (await api.patch<FuelLoad>(`/fleet/fuel/${editing.id}`, body)).data
        : (await api.post<FuelLoad>('/fleet/fuel', { ...body, busId })).data
    },
    onSuccess: (load) => {
      toast.success(
        editing
          ? 'Carga actualizada'
          : load.status === 'pending'
            ? 'Carga registrada: queda por confirmar'
            : 'Carga registrada',
      )
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
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
            {options.data?.buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.economicNumber} · {b.plates}
              </option>
            ))}
          </Select>
        )}
        <Input
          label="Fecha y hora de la carga"
          type="datetime-local"
          required
          max={now}
          value={loadedAt}
          onChange={(e) => setLoadedAt(e.target.value)}
        />
        <Input
          label={`Cantidad${fuel ? ` (${fuel.unit})` : ''}`}
          type="number"
          required
          min={0.01}
          step={0.01}
          max={tank ?? undefined}
          className="font-data"
          hint={
            fuel ? `${fuel.name}${tank ? ` · tanque de ${tank.toLocaleString('es-MX')} ${fuel.unit}` : ''}` : undefined
          }
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          label={`Precio por ${fuel?.unit ?? 'unidad'}`}
          type="number"
          required
          min={0.001}
          step={0.001}
          className="font-data"
          hint={unitPrice === null && lastPrice ? 'Último precio usado; cámbialo si es otro' : undefined}
          value={price}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
        <Input
          label="Odómetro (km)"
          type="number"
          required
          min={0}
          className="font-data"
          hint={
            bus
              ? `Actual ${bus.odometerKm.toLocaleString('es-MX')} km${
                  bus.lastLoadKm ? ` · última carga ${bus.lastLoadKm.toLocaleString('es-MX')} km` : ''
                }`
              : undefined
          }
          value={odometerKm}
          onChange={(e) => setOdometerKm(e.target.value)}
        />
        <div className="flex flex-col justify-end">
          <span className="text-sm text-fg-muted">Total</span>
          <span className="font-data text-2xl font-semibold">{total > 0 ? formatMoney(total) : '—'}</span>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-indigo-600"
          checked={isFullTank}
          onChange={(e) => setIsFullTank(e.target.checked)}
        />
        <span>
          <span className="font-medium">Tanque lleno</span>
          <span className="block text-xs text-fg-muted">
            El rendimiento se mide entre dos tanques llenos; si solo se completó una parte, desmárcalo y se suma al
            siguiente lleno.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Estación"
          hint="Opcional"
          maxLength={150}
          value={station}
          onChange={(e) => setStation(e.target.value)}
        />
        <Input
          label="Folio o ticket"
          hint="Opcional"
          maxLength={60}
          className="font-data"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
        />
      </div>
      <Textarea label="Notas" rows={2} hint="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {goesToReview && (
        <Alert tone="info">
          Coordinación confirmará la carga; hasta entonces no cuenta en el odómetro ni en el rendimiento.
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          loading={save.isPending}
          disabled={!busId || !loadedAt || !(Number(quantity) > 0) || !(Number(price) > 0) || odometerKm === ''}
        >
          {editing ? 'Guardar cambios' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}
