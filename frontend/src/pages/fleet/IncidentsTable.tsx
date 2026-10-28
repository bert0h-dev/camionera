import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { formatInstantDate, formatTime } from '../../lib/format'
import {
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_STATUSES,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
  type Paginated,
} from '../../lib/types'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { IncidentStatusBadge, SeverityBadge } from './IncidentBadges'
import { incidentFolio, orderFolio, useIncidentCategories } from './useFleet'

// "Abiertas" agrupa reportadas y en revisión; es la vista inicial
type StatusFilter = IncidentStatus | 'open' | 'closed' | ''

const isOpen = (i: Incident) => i.status === 'reported' || i.status === 'in_review'

/** Lista de incidencias con filtros; con `busId` es el historial de una unidad. */
export function IncidentsTable({ busId }: { busId?: string }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>(busId ? '' : 'open')
  const [severity, setSeverity] = useState<IncidentSeverity | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const categories = useIncidentCategories(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const group = status === 'open' || status === 'closed'
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet', 'incidents', 'list', { page, search, status, severity, categoryId, busId }],
    queryFn: async () =>
      (
        await api.get<Paginated<Incident>>('/fleet/incidents', {
          params: {
            page,
            limit: 20,
            busId,
            search: search || undefined,
            state: group ? status : undefined,
            status: !group && status ? status : undefined,
            severity: severity || undefined,
            categoryId: categoryId || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const columns: Column<Incident>[] = [
    {
      header: 'Incidencia',
      cell: (i) => (
        <div>
          <div className="font-data font-semibold">{incidentFolio(i.folio)}</div>
          <div className="text-xs text-fg-muted">
            {formatInstantDate(i.occurredAt)} · {formatTime(i.occurredAt)}
          </div>
        </div>
      ),
    },
    ...(busId
      ? []
      : [
          {
            header: 'Unidad',
            cell: (i: Incident) => (
              <div>
                <div className="font-data font-semibold">{i.bus.economicNumber}</div>
                <div className="font-data text-xs text-fg-muted">{i.bus.plates}</div>
              </div>
            ),
          },
        ]),
    {
      header: 'Qué pasó',
      cell: (i) => (
        <div className="max-w-96">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={i.severity} />
            <span className="text-xs text-fg-muted">{i.category.name}</span>
          </div>
          <div className="mt-1 truncate text-sm">{i.description}</div>
        </div>
      ),
    },
    { header: 'Reportó', cell: (i) => <span className="text-sm">{i.reporter.fullName}</span> },
    {
      header: 'Orden',
      cell: (i) =>
        i.orders[0] ? (
          <span className="font-data text-sm">{orderFolio(i.orders[0].folio)}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { header: 'Estado', cell: (i) => <IncidentStatusBadge status={i.status} /> },
  ]

  const filtered = !!(search || (status && status !== 'open') || severity || categoryId)
  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder={busId ? 'Buscar por folio o descripción…' : 'Buscar por folio, unidad o descripción…'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter)
              setPage(1)
            }}
          >
            <option value="open">Abiertas</option>
            <option value="closed">Cerradas</option>
            <option value="">Todas</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as IncidentSeverity | '')
              setPage(1)
            }}
          >
            <option value="">Toda gravedad</option>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_SEVERITY_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todas las categorías</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>
      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(i) => i.id}
        onRowClick={(i) => navigate(`/flota/incidencias/${i.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(i) =>
          i.status === 'dismissed'
            ? 'opacity-60'
            : i.severity === 'critical' && isOpen(i) && 'bg-red-50/50 dark:bg-red-500/5'
        }
        emptyIcon={AlertTriangle}
        emptyMessage={
          filtered
            ? 'Ninguna incidencia coincide con los filtros'
            : status === 'open'
              ? 'No hay incidencias abiertas'
              : 'Aún no hay incidencias'
        }
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}
