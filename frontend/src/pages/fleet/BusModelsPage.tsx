import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Bus, LayoutGrid, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { BUS_TYPE_LABELS, BUS_TYPES, type BusModel, type BusType, type Paginated } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useCanEditFleet } from './useFleet'

const preventive = (m: BusModel) =>
  [m.preventiveKm && `${m.preventiveKm.toLocaleString('es-MX')} km`, m.preventiveDays && `${m.preventiveDays} días`]
    .filter(Boolean)
    .join(' o ') || '—'

function BusModelsPage() {
  const navigate = useNavigate()
  const canEdit = useCanEditFleet()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [busType, setBusType] = useState<BusType | ''>('')
  const [includeInactive, setIncludeInactive] = useState(false)

  // Búsqueda con retardo para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet', 'bus-models', { page, search, busType, includeInactive }],
    queryFn: async () =>
      (
        await api.get<Paginated<BusModel>>('/fleet/bus-models', {
          params: { page, limit: 20, search: search || undefined, busType: busType || undefined, includeInactive },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  // Cifras de la banda: los modelos son pocos, se leen todos los activos
  const all = useQuery({
    queryKey: ['fleet', 'bus-models', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<BusModel>>('/fleet/bus-models', { params: { limit: 100 } })).data.data,
  })
  const models = all.data ?? []
  const seats = models.map((m) => m.seatCount)
  const noPlan = models.filter((m) => !m.preventiveKm && !m.preventiveDays).length

  const columns: Column<BusModel>[] = [
    {
      header: 'Modelo',
      cell: (m) => (
        <div>
          <div className="font-medium">{m.brand}</div>
          <div className="font-data text-xs text-fg-muted">{m.model}</div>
        </div>
      ),
    },
    {
      header: 'Tipo',
      cell: (m) => <Badge tone={m.busType === 'standard' ? 'neutral' : 'primary'}>{BUS_TYPE_LABELS[m.busType]}</Badge>,
    },
    { header: 'Asientos', cell: (m) => <span className="font-data font-semibold">{m.seatCount}</span> },
    { header: 'Combustible', cell: (m) => m.fuelType.name },
    {
      header: 'Rendimiento',
      cell: (m) =>
        m.expectedEfficiency ? (
          <span className="font-data">
            {Number(m.expectedEfficiency)} km/{m.fuelType.unit}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { header: 'Preventivo cada', cell: (m) => <span className="font-data text-xs">{preventive(m)}</span> },
    {
      header: 'Estado',
      cell: (m) => (
        <Badge tone={m.isActive ? 'success' : 'neutral'} dot>
          {m.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelos de autobús"
        description="Plantillas de asientos, combustible y plan de mantenimiento que heredan las unidades"
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => navigate('/flota/modelos/nuevo')}>
              Nuevo modelo
            </Button>
          )
        }
        stats={
          <>
            <HeroStat label="Modelos activos" value={models.length} tone="primary" loading={all.isLoading} />
            <HeroStat
              label="Capacidad"
              value={seats.length ? `${Math.min(...seats)}–${Math.max(...seats)}` : '—'}
              loading={all.isLoading}
              hint="asientos por modelo"
            />
            <HeroStat
              label="Doble piso"
              value={models.filter((m) => m.busType === 'double_decker').length}
              loading={all.isLoading}
              hint="modelos con dos niveles"
            />
            <HeroStat
              label="Sin plan preventivo"
              value={noPlan}
              tone={noPlan ? 'warning' : 'neutral'}
              loading={all.isLoading}
              hint="sin km ni días definidos"
            />
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por marca o modelo…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={busType}
            onChange={(e) => {
              setBusType(e.target.value as BusType | '')
              setPage(1)
            }}
          >
            <option value="">Todos los tipos</option>
            {BUS_TYPES.map((t) => (
              <option key={t} value={t}>
                {BUS_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked)
              setPage(1)
            }}
          />
          Incluir inactivos
        </label>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(m) => m.id}
        onRowClick={(m) => navigate(`/flota/modelos/${m.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(m) => !m.isActive && 'opacity-60'}
        emptyIcon={search || busType ? Bus : LayoutGrid}
        emptyMessage={search || busType ? 'Ningún modelo coincide con la búsqueda' : 'Aún no hay modelos'}
        emptyDescription={search || busType ? undefined : 'Crea el primero para diseñar su distribución de asientos'}
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

export default BusModelsPage
