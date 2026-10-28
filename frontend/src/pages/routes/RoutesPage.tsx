import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Route as RouteIcon, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMinutes, formatMoney } from '../../lib/format'
import type { Paginated, RouteListItem } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useCities } from '../fleet/useFleet'
import { RouteModal } from './RouteModal'
import { formatKm, useCanEditRoutes, useRouteSummary } from './useRoutes'

type Status = 'active' | 'inactive' | 'all'

function RoutesPage() {
  const navigate = useNavigate()
  const canEdit = useCanEditRoutes()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [originCityId, setOriginCityId] = useState('')
  const [destinationCityId, setDestinationCityId] = useState('')
  const [status, setStatus] = useState<Status>('active')
  // ?nueva=1 (desde el buscador) abre el alta
  const [editing, setEditing] = useState<RouteListItem | null | undefined>(() =>
    params.get('nueva') && canEdit ? null : undefined,
  )

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['routes', 'list', { page, search, originCityId, destinationCityId, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<RouteListItem>>('/routes', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            originCityId: originCityId || undefined,
            destinationCityId: destinationCityId || undefined,
            status,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const summary = useRouteSummary()
  const cities = useCities()
  const s = summary.data

  const columns: Column<RouteListItem>[] = [
    {
      header: 'Ruta',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="font-data text-xs text-fg-muted">{r.code}</div>
        </div>
      ),
    },
    {
      header: 'Origen → destino',
      cell: (r) => (
        <div className="font-data text-sm">
          {r.originTerminal.code} → {r.destinationTerminal.code}
          {r.originTerminal.city.timezone !== r.destinationTerminal.city.timezone && (
            <Badge tone="info" className="ml-2">
              Cambia de zona
            </Badge>
          )}
        </div>
      ),
    },
    { header: 'Distancia', cell: (r) => <span className="font-data">{formatKm(r.distanceKm)}</span> },
    { header: 'Duración', cell: (r) => <span className="font-data">{formatMinutes(r.estimatedDurationMinutes)}</span> },
    { header: 'Precio base', cell: (r) => <span className="font-data">{formatMoney(r.basePrice)}</span> },
    {
      header: 'Paradas · horarios',
      cell: (r) => (
        <span className="font-data">
          {r._count.stops} ·{' '}
          {r.isActive && !r._count.schedules ? <Badge tone="warning">sin horarios</Badge> : r._count.schedules}
        </span>
      ),
    },
    {
      header: 'Estado',
      cell: (r) => (
        <Badge tone={r.isActive ? 'success' : 'neutral'} dot>
          {r.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
  ]

  const filtered = !!(search || originCityId || destinationCityId || status !== 'active')
  const closeModal = () => {
    setEditing(undefined)
    if (params.has('nueva')) setParams({}, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rutas"
        description="Recorridos entre terminales con su distancia, duración y precio base"
        refreshing={isFetching && !isLoading}
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => setEditing(null)}>
              Nueva ruta
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Rutas activas"
              value={s?.active ?? 0}
              tone="primary"
              loading={summary.isLoading}
              hint={`${s?.inactive ?? 0} inactivas`}
            />
            <HeroStat
              label="Ciudades conectadas"
              value={s?.cities ?? 0}
              loading={summary.isLoading}
              hint={s ? `${formatKm(s.totalKm)} de red` : 'con rutas activas'}
            />
            <HeroStat
              label="Salidas por semana"
              value={s?.weeklyDepartures ?? 0}
              loading={summary.isLoading}
              hint="horarios vigentes hoy"
            />
            <HeroStat
              label="Precio base promedio"
              value={s?.averagePrice != null ? formatMoney(s.averagePrice) : '—'}
              loading={summary.isLoading}
              hint="antes de temporadas"
            />
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por clave, nombre o ciudad…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {(
          [
            ['Todos los orígenes', originCityId, setOriginCityId],
            ['Todos los destinos', destinationCityId, setDestinationCityId],
          ] as const
        ).map(([placeholder, value, setValue]) => (
          <div key={placeholder} className="w-full sm:w-48">
            <Select
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setPage(1)
              }}
            >
              <option value="">{placeholder}</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.state}
                </option>
              ))}
            </Select>
          </div>
        ))}
        <div className="w-full sm:w-36">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status)
              setPage(1)
            }}
          >
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
            <option value="all">Todas</option>
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/rutas/${r.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(r) => !r.isActive && 'opacity-60'}
        emptyIcon={RouteIcon}
        emptyMessage={filtered ? 'Ninguna ruta coincide con los filtros' : 'Aún no hay rutas'}
        emptyDescription={filtered ? undefined : 'Crea la primera ruta entre dos terminales con ubicación'}
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      {canEdit && <RouteModal route={editing} onClose={closeModal} />}
    </div>
  )
}

export default RoutesPage
