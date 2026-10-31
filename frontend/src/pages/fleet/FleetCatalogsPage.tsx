import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Fuel, Map as MapIcon, MapPin, Plus, Search } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { City, FuelType, Terminal } from '../../lib/types'
import { DEFAULT_TIMEZONE, localClock, MX_TIMEZONES, utcOffsetLabel } from '../../lib/timezones'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { FilterBar } from '../../components/ui/FilterBar'
import { normalize } from '../../components/command/normalize'
import { LoadingBlock } from '../../components/ui/Spinner'
import type { LatLng, MapPoint } from '../../components/map/TerminalMap'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { TerminalPlatformsModal } from './TerminalPlatformsModal'
import { useCanEditFleet, useCities, useFuelTypes, useTerminals } from './useFleet'

// El mapa (Leaflet) se descarga solo cuando se abre
const LocationPicker = lazy(() =>
  import('../../components/map/TerminalMap').then((m) => ({ default: m.LocationPicker })),
)
const PointsMap = lazy(() => import('../../components/map/TerminalMap').then((m) => ({ default: m.PointsMap })))

const PAGE_SIZE = 20

type TabKey = 'terminals' | 'map' | 'cities' | 'fuel'

const TABS: TabItem<TabKey>[] = [
  { key: 'terminals', label: 'Terminales', icon: Building2 },
  { key: 'map', label: 'Mapa', icon: MapIcon },
  { key: 'cities', label: 'Ciudades', icon: MapPin },
  { key: 'fuel', label: 'Combustibles', icon: Fuel },
]

const NEW_LABEL: Record<TabKey, string> = {
  terminals: 'Nueva terminal',
  map: 'Nueva terminal',
  cities: 'Nueva ciudad',
  fuel: 'Nuevo combustible',
}

type Draft =
  | { kind: 'fuel'; id?: string; name: string; unit: string }
  | { kind: 'cities'; id?: string; name: string; state: string; timezone: string }
  | {
      kind: 'terminals'
      id?: string
      code: string
      name: string
      cityId: string
      address: string
      location: LatLng | null
      /** Dirección del punto marcado cuando el campo ya tenía texto (no se envía) */
      suggestion?: string
    }

type DraftKind = Draft['kind']

const URL: Record<DraftKind, string> = {
  fuel: '/fleet/fuel-types',
  cities: '/fleet/cities',
  terminals: '/fleet/terminals',
}

const empty = (tab: TabKey): Draft =>
  tab === 'fuel'
    ? { kind: 'fuel', name: '', unit: 'L' }
    : tab === 'cities'
      ? { kind: 'cities', name: '', state: '', timezone: DEFAULT_TIMEZONE }
      : { kind: 'terminals', code: '', name: '', cityId: '', address: '', location: null }

const locationOf = (t: Terminal): LatLng | null =>
  t.latitude != null && t.longitude != null ? { lat: Number(t.latitude), lng: Number(t.longitude) } : null

const activeBadge = (active: boolean) => (
  <Badge tone={active ? 'success' : 'neutral'} dot>
    {active ? 'Activo' : 'Inactivo'}
  </Badge>
)

function FleetCatalogsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const canEdit = useCanEditFleet()
  const [tab, setTab] = useState<TabKey>('terminals')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const changeTab = (key: TabKey) => {
    setTab(key)
    setSearch('')
    setPage(1)
  }
  const [draft, setDraft] = useState<Draft | null>(null)
  const [platformsOf, setPlatformsOf] = useState<Terminal | null>(null)

  const fuels = useFuelTypes(true)
  const cities = useCities(true)
  const terminals = useTerminals(true)

  const save = useMutation({
    mutationFn: async (draft: Draft) => {
      const { kind, id } = draft
      let body: object
      if (draft.kind === 'terminals') {
        const { location, address, code, name, cityId } = draft
        body = {
          code,
          name,
          cityId,
          address: address || null,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
        }
      } else {
        const { kind: _k, id: _i, ...rest } = draft
        body = rest
      }
      if (id) await api.patch(`${URL[kind]}/${id}`, body)
      else await api.post(URL[kind], body)
    },
    onSuccess: () => {
      toast.success('Cambios guardados')
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      setDraft(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggle = useMutation({
    mutationFn: ({ kind, id, isActive }: { kind: DraftKind; id: string; isActive: boolean }) =>
      api.patch(`${URL[kind]}/${id}`, { isActive: !isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fleet'] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const actions = (kind: DraftKind, row: { id: string; isActive: boolean }, edit: Draft) =>
    canEdit && (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={() => setDraft(edit)}>
          Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggle.mutate({ kind, ...row })}>
          {row.isActive ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
    )

  const terminalColumns: Column<Terminal>[] = [
    { header: 'Clave', cell: (t) => <span className="font-data font-semibold">{t.code}</span> },
    { header: 'Terminal', cell: (t) => <span className="font-medium">{t.name}</span> },
    { header: 'Ciudad', cell: (t) => `${t.city.name}, ${t.city.state}` },
    { header: 'Dirección', cell: (t) => t.address ?? <span className="text-fg-subtle">—</span> },
    {
      header: 'Ubicación',
      cell: (t) =>
        locationOf(t) ? (
          <Badge tone="success" dot>
            Marcada
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Sin ubicación
          </Badge>
        ),
    },
    { header: 'Estado', cell: (t) => activeBadge(t.isActive) },
    {
      header: '',
      cell: (t) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setPlatformsOf(t)
          }}
        >
          Andenes
        </Button>
      ),
    },
    {
      header: '',
      cell: (t) =>
        actions('terminals', t, {
          kind: 'terminals',
          id: t.id,
          code: t.code,
          name: t.name,
          cityId: t.cityId,
          address: t.address ?? '',
          location: locationOf(t),
        }),
    },
  ]

  const cityColumns: Column<City>[] = [
    { header: 'Ciudad', cell: (c) => <span className="font-medium">{c.name}</span> },
    { header: 'Estado', cell: (c) => c.state },
    {
      header: 'Zona horaria',
      cell: (c) => (
        <div>
          <div className="font-data">
            {localClock(c.timezone)} <span className="text-xs text-fg-muted">{utcOffsetLabel(c.timezone)}</span>
          </div>
          <div className="text-xs text-fg-muted">{c.timezone.replace('America/', '').replace('_', ' ')}</div>
        </div>
      ),
    },
    { header: 'Terminales', cell: (c) => <span className="font-data">{c._count?.terminals ?? 0}</span> },
    { header: 'Situación', cell: (c) => activeBadge(c.isActive) },
    {
      header: '',
      cell: (c) =>
        actions('cities', c, { kind: 'cities', id: c.id, name: c.name, state: c.state, timezone: c.timezone }),
    },
  ]

  const fuelColumns: Column<FuelType>[] = [
    { header: 'Combustible', cell: (f) => <span className="font-medium">{f.name}</span> },
    { header: 'Unidad', cell: (f) => <span className="font-data">{f.unit}</span> },
    { header: 'Modelos que lo usan', cell: (f) => <span className="font-data">{f._count?.busModels ?? 0}</span> },
    { header: 'Estado', cell: (f) => activeBadge(f.isActive) },
    { header: '', cell: (f) => actions('fuel', f, { kind: 'fuel', id: f.id, name: f.name, unit: f.unit }) },
  ]

  const activeCities = (cities.data ?? []).filter((c) => c.isActive)
  const loading = fuels.isLoading || cities.isLoading || terminals.isLoading
  const count = (rows: { isActive: boolean }[] | undefined) => (rows ?? []).filter((r) => r.isActive).length
  const activeTerminals = (terminals.data ?? []).filter((t) => t.isActive)
  const unlocated = activeTerminals.filter((t) => !locationOf(t)).length

  // Búsqueda y paginado en pantalla: los selectores de otras pantallas siguen recibiendo la lista completa
  const matches = (...fields: string[]) => {
    const terms = normalize(search).split(/s+/).filter(Boolean)
    const text = normalize(fields.join(' '))
    return terms.every((t) => text.includes(t))
  }
  const terminalRows = (terminals.data ?? []).filter((t) => matches(t.code, t.name, t.city.name, t.city.state))
  const cityRows = (cities.data ?? []).filter((c) => matches(c.name, c.state))
  const pages = (rows: unknown[]) => Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageOf = <T,>(rows: T[]) => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const points = useMemo<MapPoint[]>(
    () =>
      (terminals.data ?? []).flatMap((t) => {
        const loc = t.isActive && locationOf(t)
        return loc
          ? [{ id: t.id, ...loc, title: `${t.code} · ${t.name}`, subtitle: `${t.city.name}, ${t.city.state}` }]
          : []
      }),
    [terminals.data],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogos de flota"
        description="Terminales, ciudades y combustibles que usan las unidades y las rutas"
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => setDraft(empty(tab))}>
              {NEW_LABEL[tab]}
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Terminales"
              value={count(terminals.data)}
              tone="primary"
              loading={loading}
              hint="activas"
            />
            <HeroStat label="Ciudades" value={count(cities.data)} loading={loading} hint="con servicio" />
            <HeroStat
              label="Combustibles"
              value={count(fuels.data)}
              loading={loading}
              hint="disponibles para los modelos"
            />
            <HeroStat
              label="Ciudades sin terminal"
              value={activeCities.filter((c) => !c._count?.terminals).length}
              tone={activeCities.some((c) => !c._count?.terminals) ? 'warning' : 'neutral'}
              loading={loading}
              hint="aún no tienen dónde operar"
            />
            <HeroStat
              label="Terminales sin ubicación"
              value={unlocated}
              tone={unlocated ? 'warning' : 'neutral'}
              loading={loading}
              hint="no se podrán usar hasta marcarlas"
            />
          </>
        }
        statsColumns={5}
        bottom={<Tabs variant="band" items={TABS} value={tab} onChange={changeTab} />}
      />

      {(tab === 'terminals' || tab === 'cities') && (
        <FilterBar>
          <div className="min-w-60 flex-1">
            <Input
              icon={Search}
              placeholder={tab === 'terminals' ? 'Buscar por clave, nombre o ciudad…' : 'Buscar por ciudad o estado…'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </FilterBar>
      )}
      {tab === 'terminals' && (
        <Table
          columns={terminalColumns}
          rows={pageOf(terminalRows)}
          rowKey={(t) => t.id}
          loading={terminals.isLoading}
          rowClassName={(t) => !t.isActive && 'opacity-60'}
          emptyIcon={Building2}
          emptyMessage={search ? 'Ninguna terminal coincide con la búsqueda' : 'Aún no hay terminales'}
          emptyDescription={search ? undefined : 'Primero registra la ciudad y después su terminal'}
        />
      )}
      {tab === 'terminals' && terminalRows.length > PAGE_SIZE && (
        <Pagination page={page} totalPages={pages(terminalRows)} total={terminalRows.length} onChange={setPage} />
      )}
      {tab === 'map' && (
        <div className="space-y-2">
          <Suspense fallback={<LoadingBlock text="Cargando mapa…" />}>
            <PointsMap points={points} />
          </Suspense>
          {unlocated > 0 && (
            <p className="text-sm text-fg-muted">
              {unlocated} terminal(es) activa(s) sin ubicación no aparecen en el mapa; edítalas para marcarlas.
            </p>
          )}
        </div>
      )}
      {tab === 'cities' && (
        <Table
          columns={cityColumns}
          rows={pageOf(cityRows)}
          rowKey={(c) => c.id}
          loading={cities.isLoading}
          rowClassName={(c) => !c.isActive && 'opacity-60'}
          emptyIcon={MapPin}
          emptyMessage={search ? 'Ninguna ciudad coincide con la búsqueda' : 'Aún no hay ciudades'}
        />
      )}
      {tab === 'cities' && cityRows.length > PAGE_SIZE && (
        <Pagination page={page} totalPages={pages(cityRows)} total={cityRows.length} onChange={setPage} />
      )}
      {tab === 'fuel' && (
        <Table
          columns={fuelColumns}
          rows={fuels.data ?? []}
          rowKey={(f) => f.id}
          loading={fuels.isLoading}
          rowClassName={(f) => !f.isActive && 'opacity-60'}
          emptyIcon={Fuel}
          emptyMessage="Aún no hay combustibles"
        />
      )}

      <Modal
        open={!!draft}
        title={draft ? (draft.id ? 'Editar' : NEW_LABEL[draft.kind]) : ''}
        size={draft?.kind === 'terminals' ? 'lg' : 'md'}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(draft)
            }}
          >
            {draft.kind === 'fuel' && (
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Input
                  label="Nombre"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <Input
                  label="Unidad"
                  required
                  hint="L, m³, kg…"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                />
              </div>
            )}
            {draft.kind === 'cities' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Ciudad"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <Input
                  label="Estado"
                  required
                  value={draft.state}
                  onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Select
                    label="Zona horaria"
                    hint={`Hora local ahora: ${localClock(draft.timezone)} (${utcOffsetLabel(draft.timezone)}). Las salidas y llegadas de las rutas se calculan con ella.`}
                    value={draft.timezone}
                    onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  >
                    {MX_TIMEZONES.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
            {draft.kind === 'terminals' && (
              <>
                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                  <Input
                    label="Clave"
                    required
                    maxLength={10}
                    className="font-data uppercase"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  />
                  <Input
                    label="Nombre"
                    required
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <Select
                  label="Ciudad"
                  required
                  value={draft.cityId}
                  onChange={(e) => setDraft({ ...draft, cityId: e.target.value })}
                  hint={activeCities.length ? undefined : 'Registra primero una ciudad en la pestaña Ciudades'}
                >
                  <option value="">Selecciona…</option>
                  {activeCities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.state}
                    </option>
                  ))}
                </Select>
                <Textarea
                  label="Dirección"
                  rows={2}
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
                {draft.suggestion && draft.suggestion !== draft.address.trim() && (
                  <p className="-mt-2 text-xs text-fg-muted">
                    Dirección del punto: <span className="text-fg">{draft.suggestion}</span> ·{' '}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setDraft({ ...draft, address: draft.suggestion ?? '', suggestion: undefined })}
                    >
                      Usar esta
                    </button>
                  </p>
                )}
                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-fg">Ubicación en el mapa</span>
                  <Suspense fallback={<LoadingBlock text="Cargando mapa…" />}>
                    <LocationPicker
                      value={draft.location}
                      onChange={(location) => setDraft((d) => (d?.kind === 'terminals' ? { ...d, location } : d))}
                      // Llena la dirección solo si está vacía; si ya hay texto queda como sugerencia
                      onAddress={(address) =>
                        setDraft((d) =>
                          d?.kind !== 'terminals'
                            ? d
                            : d.address.trim()
                              ? { ...d, suggestion: address }
                              : { ...d, address, suggestion: undefined },
                        )
                      }
                      searchHint={[
                        draft.name,
                        activeCities.find((c) => c.id === draft.cityId)?.name,
                        activeCities.find((c) => c.id === draft.cityId)?.state,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    />
                  </Suspense>
                  {!draft.location && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Puedes guardarla sin ubicación, pero no se podrá asignar a unidades ni rutas hasta marcarla.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={save.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <TerminalPlatformsModal terminal={platformsOf} canEdit={canEdit} onClose={() => setPlatformsOf(null)} />
    </div>
  )
}

export default FleetCatalogsPage
