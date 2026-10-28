import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Fuel, Pencil, Search, Trash2, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatInstantDate, formatMoney, formatTime } from '../../lib/format'
import {
  FUEL_LOAD_STATUS_LABELS,
  FUEL_LOAD_STATUSES,
  type FuelLoad,
  type FuelLoadStatus,
  type Paginated,
} from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { Modal } from '../../components/ui/Modal'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { FuelLoadModal, type FuelPreset } from './FuelLoadModal'
import { formatEfficiency, useFuelRole, useTerminals } from './useFleet'

const STATUS_TONE: Record<FuelLoadStatus, BadgeTone> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'neutral',
}

export function FuelStatusBadge({ status }: { status: FuelLoadStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {FUEL_LOAD_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Rendimiento de la carga contra el esperado del modelo; las parciales acumulan. */
function EfficiencyCell({ load, threshold }: { load: FuelLoad; threshold?: number }) {
  if (load.status !== 'confirmed') return <span className="text-fg-subtle">—</span>
  if (!load.isFullTank) return <span className="text-xs text-fg-muted">Parcial · acumula</span>
  if (load.efficiency === null) return <span className="text-xs text-fg-muted">Inicio de medición</span>
  const expected = load.bus.busModel.expectedEfficiency ? Number(load.bus.busModel.expectedEfficiency) : null
  const drop = expected ? ((expected - Number(load.efficiency)) / expected) * 100 : null
  const low = drop !== null && threshold !== undefined && drop >= threshold
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-data font-semibold">{formatEfficiency(load.efficiency, load.fuelType.unit)}</span>
        {low && <Badge tone="danger">Bajo</Badge>}
      </div>
      <div className="font-data text-xs text-fg-muted">{load.tripKm?.toLocaleString('es-MX')} km recorridos</div>
    </div>
  )
}

/** Cargas de combustible con filtros; con `busId` es el historial de una unidad. */
export function FuelLoadsTable({
  busId,
  initialStatus = '',
  threshold,
}: {
  busId?: string
  initialStatus?: FuelLoadStatus | ''
  threshold?: number
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { canManage, canRead } = useFuelRole()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<FuelLoadStatus | ''>(initialStatus)
  const [terminalId, setTerminalId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [edit, setEdit] = useState<FuelPreset | null>(null)
  const [removing, setRemoving] = useState<FuelLoad | null>(null)
  const [rejecting, setRejecting] = useState<FuelLoad | null>(null)
  const [reason, setReason] = useState('')
  const terminals = useTerminals(false, !busId && canRead)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet', 'fuel', 'list', { page, search, status, terminalId, from, to, busId }],
    queryFn: async () =>
      (
        await api.get<Paginated<FuelLoad>>('/fleet/fuel', {
          params: {
            page,
            limit: 20,
            busId,
            search: search || undefined,
            status: status || undefined,
            terminalId: terminalId || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const confirm = useMutation({
    mutationFn: (l: FuelLoad) => api.post(`/fleet/fuel/${l.id}/confirm`),
    onSuccess: () => {
      toast.success('Carga confirmada')
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const reject = useMutation({
    mutationFn: (l: FuelLoad) => api.post(`/fleet/fuel/${l.id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Carga rechazada')
      setRejecting(null)
      setReason('')
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: (l: FuelLoad) => api.delete(`/fleet/fuel/${l.id}`),
    onSuccess: () => {
      toast.success('Carga eliminada')
      setRemoving(null)
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const canEdit = (l: FuelLoad) =>
    l.status === 'pending' ? canManage || l.recordedBy === user?.id : l.status === 'confirmed' && canManage && !!l.isLastConfirmed

  const columns: Column<FuelLoad>[] = [
    {
      header: 'Carga',
      cell: (l) => (
        <div>
          <div className="font-medium">{formatInstantDate(l.loadedAt)}</div>
          <div className="text-xs text-fg-muted">
            {formatTime(l.loadedAt)}
            {l.station && ` · ${l.station}`}
          </div>
        </div>
      ),
    },
    ...(busId
      ? []
      : [
          {
            header: 'Unidad',
            cell: (l: FuelLoad) => (
              <div>
                <div className="font-data font-semibold">{l.bus.economicNumber}</div>
                <div className="font-data text-xs text-fg-muted">{l.bus.terminal.code}</div>
              </div>
            ),
          },
        ]),
    {
      header: 'Cantidad',
      cell: (l) => (
        <div>
          <div className="font-data">
            {Number(l.quantity).toLocaleString('es-MX')} {l.fuelType.unit}
          </div>
          <div className="text-xs text-fg-muted">{l.isFullTank ? 'Tanque lleno' : 'Parcial'}</div>
        </div>
      ),
    },
    {
      header: 'Importe',
      cell: (l) => (
        <div>
          <div className="font-data font-semibold">{formatMoney(l.total)}</div>
          <div className="font-data text-xs text-fg-muted">
            {formatMoney(l.unitPrice)}/{l.fuelType.unit}
          </div>
        </div>
      ),
    },
    {
      header: 'Odómetro',
      cell: (l) => <span className="font-data">{l.odometerKm.toLocaleString('es-MX')} km</span>,
    },
    { header: 'Rendimiento', cell: (l) => <EfficiencyCell load={l} threshold={threshold} /> },
    {
      header: 'Estado',
      cell: (l) => (
        <div className="max-w-56">
          <FuelStatusBadge status={l.status} />
          <div className="mt-1 truncate text-xs text-fg-muted" title={l.rejectReason ?? undefined}>
            {l.status === 'rejected' ? l.rejectReason : l.recorder.fullName}
          </div>
        </div>
      ),
    },
    {
      header: '',
      cell: (l) => (
        <div className="flex justify-end gap-1">
          {l.status === 'pending' && canManage && (
            <>
              <Button
                size="sm"
                icon={Check}
                loading={confirm.isPending && confirm.variables?.id === l.id}
                onClick={() => confirm.mutate(l)}
              >
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => setRejecting(l)}>
                Rechazar
              </Button>
            </>
          )}
          {canEdit(l) && (
            <>
              <Button
                size="icon"
                variant="ghost"
                icon={Pencil}
                aria-label="Corregir"
                onClick={() => setEdit({ load: l })}
              />
              <Button size="icon" variant="ghost" icon={Trash2} aria-label="Eliminar" onClick={() => setRemoving(l)} />
            </>
          )}
        </div>
      ),
    },
  ]

  const filtered = !!(search || status || terminalId || from || to)
  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder={busId ? 'Buscar por estación o ticket…' : 'Buscar por unidad, estación o ticket…'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as FuelLoadStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {FUEL_LOAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FUEL_LOAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {!busId && canRead && (
          <div className="w-full sm:w-48">
            <Select
              value={terminalId}
              onChange={(e) => {
                setTerminalId(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas las terminales</option>
              {terminals.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-full sm:w-40">
          <Input
            type="date"
            aria-label="Desde"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="w-full sm:w-40">
          <Input
            type="date"
            aria-label="Hasta"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </FilterBar>
      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(l) => l.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(l) =>
          l.status === 'rejected' ? 'opacity-60' : l.status === 'pending' && 'bg-amber-50/50 dark:bg-amber-500/5'
        }
        emptyIcon={Fuel}
        emptyMessage={filtered ? 'Ninguna carga coincide con los filtros' : 'Aún no hay cargas registradas'}
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      <FuelLoadModal preset={edit} onClose={() => setEdit(null)} />
      <ConfirmModal
        open={!!removing}
        title="Eliminar carga"
        message="La carga se borra y el rendimiento de la unidad se vuelve a calcular. El odómetro no regresa."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
      <Modal open={!!rejecting} title="Rechazar carga" onClose={() => setRejecting(null)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (rejecting) reject.mutate(rejecting)
          }}
        >
          <p className="text-sm text-fg-muted">
            {rejecting &&
              `Unidad ${rejecting.bus.economicNumber} · ${Number(rejecting.quantity).toLocaleString('es-MX')} ${rejecting.fuelType.unit} · registrada por ${rejecting.recorder.fullName}. El conductor verá el motivo.`}
          </p>
          <Textarea
            label="Motivo"
            required
            rows={3}
            placeholder="Ej. el ticket no coincide con la cantidad"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3}>
              Rechazar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
