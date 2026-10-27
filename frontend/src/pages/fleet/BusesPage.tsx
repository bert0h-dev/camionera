import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Bus, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import {
  BUS_STATUS_LABELS,
  BUS_STATUSES,
  type BusListItem,
  type BusModel,
  type BusStatus,
  type Paginated,
} from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { BusStatusBadge, FitBadge } from './BusStatusBadge'
import { useBusSummary, useCanEditFleet, useTerminals } from './useFleet'

function BusesPage() {
  const navigate = useNavigate()
  const canEdit = useCanEditFleet()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<BusStatus | ''>('')
  const [terminalId, setTerminalId] = useState('')
  const [busModelId, setBusModelId] = useState('')

  // Búsqueda con retardo para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet', 'buses', { page, search, status, terminalId, busModelId }],
    queryFn: async () =>
      (
        await api.get<Paginated<BusListItem>>('/fleet/buses', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            status: status || undefined,
            terminalId: terminalId || undefined,
            busModelId: busModelId || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const summary = useBusSummary()
  const terminals = useTerminals()
  const models = useQuery({
    queryKey: ['fleet', 'bus-models', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<BusModel>>('/fleet/bus-models', { params: { limit: 100 } })).data.data,
  })
  const s = summary.data
  const docAlerts = (s?.documentsExpired ?? 0) + (s?.documentsExpiring ?? 0)

  const columns: Column<BusListItem>[] = [
    {
      header: 'Unidad',
      cell: (b) => (
        <div>
          <div className="font-data font-semibold">{b.economicNumber}</div>
          <div className="font-data text-xs text-fg-muted">{b.plates}</div>
        </div>
      ),
    },
    {
      header: 'Modelo',
      cell: (b) => (
        <div>
          <div>
            {b.busModel.brand} {b.busModel.model}
          </div>
          <div className="text-xs text-fg-muted">{b.year}</div>
        </div>
      ),
    },
    { header: 'Terminal', cell: (b) => <span className="font-data">{b.terminal.code}</span> },
    {
      header: 'Asientos',
      cell: (b) => (
        <span className="font-data">
          {b.busModel.seatCount - b.blockedSeats}
          {b.blockedSeats > 0 && <span className="text-xs text-fg-muted"> ({b.blockedSeats} bloq.)</span>}
        </span>
      ),
    },
    { header: 'Odómetro', cell: (b) => <span className="font-data">{b.odometerKm.toLocaleString('es-MX')} km</span> },
    {
      header: 'Documentos',
      cell: (b) =>
        b.documents.expired ? (
          <Badge tone="danger">{b.documents.expired} vencido(s)</Badge>
        ) : b.documents.expiring ? (
          <Badge tone="warning">{b.documents.expiring} por vencer</Badge>
        ) : (
          <span className="text-xs text-fg-muted">En orden</span>
        ),
    },
    { header: 'Estado', cell: (b) => <BusStatusBadge status={b.status} /> },
    { header: 'Operación', cell: (b) => <FitBadge fit={b.fit} reasons={b.reasons} /> },
  ]

  const filtered = !!(search || status || terminalId || busModelId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unidades"
        description="Autobuses de la flota, sus asientos, documentos y odómetro"
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => navigate('/flota/unidades/nueva')}>
              Nueva unidad
            </Button>
          )
        }
        statsColumns={5}
        stats={
          <>
            <HeroStat
              label="Unidades"
              value={s?.total ?? 0}
              tone="primary"
              loading={summary.isLoading}
              hint="en la flota"
            />
            <HeroStat
              label="Disponibles"
              value={s?.available ?? 0}
              tone="success"
              loading={summary.isLoading}
              hint={`${s?.inService ?? 0} en servicio`}
            />
            <HeroStat
              label="En mantenimiento"
              value={s?.maintenance ?? 0}
              tone={s?.maintenance ? 'warning' : 'neutral'}
              loading={summary.isLoading}
              hint={`${s?.outOfService ?? 0} fuera de servicio`}
            />
            <HeroStat
              label="No aptas"
              value={s?.unfit ?? 0}
              tone={s?.unfit ? 'danger' : 'neutral'}
              loading={summary.isLoading}
              hint="no pueden salir hoy"
            />
            <HeroStat
              label="Documentos"
              value={docAlerts}
              tone={s?.documentsExpired ? 'danger' : docAlerts ? 'warning' : 'neutral'}
              loading={summary.isLoading}
              hint={`${s?.documentsExpired ?? 0} vencidos · ${s?.documentsExpiring ?? 0} vencen en ${s?.alertDays ?? 30} días`}
            />
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por número económico, placas o VIN…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as BusStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {BUS_STATUSES.map((st) => (
              <option key={st} value={st}>
                {BUS_STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
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
        <div className="w-full sm:w-48">
          <Select
            value={busModelId}
            onChange={(e) => {
              setBusModelId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos los modelos</option>
            {models.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brand} {m.model}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(b) => b.id}
        onRowClick={(b) => navigate(`/flota/unidades/${b.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(b) => b.status === 'out_of_service' && 'opacity-60'}
        emptyIcon={Bus}
        emptyMessage={filtered ? 'Ninguna unidad coincide con los filtros' : 'Aún no hay unidades'}
        emptyDescription={filtered ? undefined : 'Registra la primera unidad a partir de un modelo'}
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

export default BusesPage
