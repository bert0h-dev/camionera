import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { dateOnly } from '../../lib/format'
import {
  BUS_DOCUMENT_LABELS,
  BUS_DOCUMENT_TYPES,
  BUS_STATUS_LABELS,
  BUS_STATUSES,
  type BusDetail,
  type BusDocument,
  type BusDocumentType,
  type BusSeat,
  type BusStatus,
} from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

/** Mutación que refresca la unidad y la lista al terminar. */
function useBusMutation<T>(busId: string, fn: (vars: T) => Promise<unknown>, success: string, onDone: () => void) {
  const toast = useToast()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success)
      queryClient.invalidateQueries({ queryKey: ['fleet', 'buses'] })
      queryClient.invalidateQueries({ queryKey: ['fleet', 'bus-history', busId] })
      onDone()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
}

const NEEDS_REASON: BusStatus[] = ['maintenance', 'out_of_service']

export function StatusModal({ bus, open, onClose }: { bus: BusDetail; open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<BusStatus>(bus.status === 'available' ? 'maintenance' : 'available')
  const [reason, setReason] = useState('')
  const save = useBusMutation(
    bus.id,
    () => api.post(`/fleet/buses/${bus.id}/status`, { status, reason }),
    'Estado actualizado',
    onClose,
  )
  const needsReason = NEEDS_REASON.includes(status)

  return (
    <Modal open={open} title="Cambiar estado" description={`Unidad ${bus.economicNumber}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(undefined)
        }}
      >
        <Select label="Nuevo estado" value={status} onChange={(e) => setStatus(e.target.value as BusStatus)}>
          {BUS_STATUSES.filter((s) => s !== bus.status).map((s) => (
            <option key={s} value={s}>
              {BUS_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {status === 'in_service' && !bus.firstServiceAt && (
          <Alert tone="warning">
            Al salir a servicio por primera vez ya no se podrá cambiar el modelo de la unidad.
          </Alert>
        )}
        <Textarea
          label="Motivo"
          required={needsReason}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={needsReason && !reason.trim()}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function OdometerModal({ bus, open, onClose }: { bus: BusDetail; open: boolean; onClose: () => void }) {
  const [km, setKm] = useState(String(bus.odometerKm))
  const save = useBusMutation(
    bus.id,
    () => api.post(`/fleet/buses/${bus.id}/odometer`, { km: Number(km) }),
    'Odómetro actualizado',
    onClose,
  )
  const lower = Number(km) < bus.odometerKm

  return (
    <Modal
      open={open}
      title="Registrar odómetro"
      description={`Unidad ${bus.economicNumber}`}
      size="sm"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(undefined)
        }}
      >
        <Input
          label="Lectura (km)"
          type="number"
          min={bus.odometerKm}
          className="font-data"
          value={km}
          error={lower ? `No puede ser menor a ${bus.odometerKm.toLocaleString('es-MX')} km` : undefined}
          hint={`Lectura actual: ${bus.odometerKm.toLocaleString('es-MX')} km`}
          onChange={(e) => setKm(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={lower || !km}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function SeatModal({ busId, seat, onClose }: { busId: string; seat: BusSeat | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const save = useBusMutation(
    busId,
    (blocked: boolean) => api.patch(`/fleet/buses/${busId}/seats/${seat!.id}`, { blocked, reason }),
    seat?.isBlocked ? 'Asiento desbloqueado' : 'Asiento bloqueado',
    () => {
      setReason('')
      onClose()
    },
  )

  return (
    <Modal open={!!seat} title={`Asiento ${seat?.number ?? ''}`} size="sm" onClose={onClose}>
      {seat &&
        (seat.isBlocked ? (
          <div className="space-y-4">
            <Alert tone="warning" title="Bloqueado">
              {seat.blockReason}
            </Alert>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button loading={save.isPending} onClick={() => save.mutate(false)}>
                Desbloquear
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(true)
            }}
          >
            <Textarea
              label="Motivo del bloqueo"
              required
              rows={2}
              placeholder="Asiento dañado, reservado para personal…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-fg-muted">Un asiento bloqueado no se podrá vender.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={save.isPending} disabled={!reason.trim()}>
                Bloquear
              </Button>
            </div>
          </form>
        ))}
    </Modal>
  )
}

interface DocDraft {
  type: BusDocumentType
  folio: string
  issuer: string
  issueDate: string
  expiryDate: string
  notes: string
}

/** Alta o edición de un documento; `doc` null = nuevo. */
export function DocumentModal({
  busId,
  doc,
  open,
  onClose,
}: {
  busId: string
  doc: BusDocument | null
  open: boolean
  onClose: () => void
}) {
  const [draft, setDraft] = useState<DocDraft>(
    doc
      ? {
          type: doc.type,
          folio: doc.folio,
          issuer: doc.issuer ?? '',
          issueDate: dateOnly(doc.issueDate),
          expiryDate: dateOnly(doc.expiryDate),
          notes: doc.notes ?? '',
        }
      : { type: 'insurance', folio: '', issuer: '', issueDate: '', expiryDate: '', notes: '' },
  )
  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const save = useBusMutation(
    busId,
    async () => {
      const { type, ...rest } = draft
      const body = { ...rest, expiryDate: rest.expiryDate || null }
      if (doc) await api.patch(`/fleet/buses/${busId}/documents/${doc.id}`, body)
      else await api.post(`/fleet/buses/${busId}/documents`, { type, ...body })
    },
    'Documento guardado',
    onClose,
  )

  return (
    <Modal open={open} title={doc ? 'Editar documento' : 'Nuevo documento'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(undefined)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo"
            disabled={!!doc}
            value={draft.type}
            onChange={(e) => set('type', e.target.value as BusDocumentType)}
          >
            {BUS_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {BUS_DOCUMENT_LABELS[t]}
              </option>
            ))}
          </Select>
          <Input
            label="Folio o póliza"
            required
            className="font-data"
            value={draft.folio}
            onChange={(e) => set('folio', e.target.value)}
          />
          <Input
            label="Emisor"
            placeholder="Aseguradora, SICT…"
            value={draft.issuer}
            onChange={(e) => set('issuer', e.target.value)}
          />
          <div />
          <Input
            label="Expedición"
            type="date"
            required
            value={draft.issueDate}
            onChange={(e) => set('issueDate', e.target.value)}
          />
          <Input
            label="Vencimiento"
            type="date"
            hint="Vacío si no vence"
            value={draft.expiryDate}
            onChange={(e) => set('expiryDate', e.target.value)}
          />
        </div>
        <Textarea label="Notas" rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={draft.folio.trim().length < 2 || !draft.issueDate}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
