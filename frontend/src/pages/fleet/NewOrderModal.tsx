import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { todayKey } from '../../lib/format'
import type { BusListItem, MaintenanceOrder, MaintenancePriority, MaintenanceType, Paginated } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { orderFolio } from './useFleet'

export interface NewOrderPreset {
  busId?: string
  type?: MaintenanceType
  description?: string
}

/** Alta de una orden de mantenimiento; los preventivos toman las tareas del catálogo. */
export function NewOrderModal({ preset, onClose }: { preset: NewOrderPreset | null; onClose: () => void }) {
  return (
    <Modal open={!!preset} title="Nueva orden de mantenimiento" size="lg" onClose={onClose}>
      {preset && <OrderForm key={JSON.stringify(preset)} preset={preset} onClose={onClose} />}
    </Modal>
  )
}

function OrderForm({ preset, onClose }: { preset: NewOrderPreset; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busId, setBusId] = useState(preset.busId ?? '')
  const [type, setType] = useState<MaintenanceType>(preset.type ?? 'preventive')
  const [priority, setPriority] = useState<MaintenancePriority>('normal')
  const [description, setDescription] = useState(preset.description ?? '')
  const [scheduledDate, setScheduledDate] = useState(todayKey())
  const [mechanicId, setMechanicId] = useState('')
  const [externalShop, setExternalShop] = useState('')

  const buses = useQuery({
    queryKey: ['fleet', 'buses', 'options'],
    queryFn: async () =>
      (await api.get<Paginated<BusListItem>>('/fleet/buses', { params: { limit: 100 } })).data.data.filter(
        (b) => b.status !== 'out_of_service',
      ),
  })
  const mechanics = useQuery({
    queryKey: ['fleet', 'maintenance', 'mechanics'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/fleet/maintenance/mechanics')).data,
  })

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<MaintenanceOrder>('/fleet/maintenance/orders', {
          busId,
          type,
          priority,
          description,
          scheduledDate,
          mechanicId: mechanicId || null,
          externalShop,
        })
      ).data,
    onSuccess: (order) => {
      toast.success(`Orden ${orderFolio(order.folio)} creada`)
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      onClose()
      navigate(`/flota/mantenimiento/${order.id}`)
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
        <Select label="Unidad" required value={busId} onChange={(e) => setBusId(e.target.value)}>
          <option value="">Selecciona…</option>
          {buses.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.economicNumber} · {b.plates} · {b.busModel.brand} {b.busModel.model}
            </option>
          ))}
        </Select>
        <Input
          label="Fecha programada"
          type="date"
          required
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
        />
        <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as MaintenanceType)}>
          <option value="preventive">Preventivo</option>
          <option value="corrective">Correctivo</option>
        </Select>
        <Select label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
          <option value="normal">Normal</option>
          <option value="urgent">Urgente</option>
        </Select>
        <Select
          label="Mecánico"
          value={mechanicId}
          onChange={(e) => setMechanicId(e.target.value)}
          hint={mechanics.data && !mechanics.data.length ? 'No hay usuarios con rol mecánico' : 'Opcional'}
        >
          <option value="">Sin asignar</option>
          {mechanics.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </Select>
        <Input
          label="Taller externo"
          placeholder="Vacío = taller interno"
          value={externalShop}
          onChange={(e) => setExternalShop(e.target.value)}
        />
      </div>
      <Textarea
        label="Descripción"
        required
        rows={3}
        placeholder={type === 'preventive' ? 'Servicio de 15,000 km' : 'Qué falla tiene la unidad'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {type === 'preventive' && (
        <p className="text-xs text-fg-muted">
          Se agregarán las tareas base del preventivo; después puedes añadir más en la orden.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!busId || description.trim().length < 3}>
          Crear orden
        </Button>
      </div>
    </form>
  )
}
