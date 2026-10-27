import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Fuel, MapPin, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { City, FuelType, Terminal } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { useCanEditFleet, useCities, useFuelTypes, useTerminals } from './useFleet'

type TabKey = 'terminals' | 'cities' | 'fuel'

const TABS: TabItem<TabKey>[] = [
  { key: 'terminals', label: 'Terminales', icon: Building2 },
  { key: 'cities', label: 'Ciudades', icon: MapPin },
  { key: 'fuel', label: 'Combustibles', icon: Fuel },
]

const NEW_LABEL: Record<TabKey, string> = {
  terminals: 'Nueva terminal',
  cities: 'Nueva ciudad',
  fuel: 'Nuevo combustible',
}

type Draft =
  | { kind: 'fuel'; id?: string; name: string; unit: string }
  | { kind: 'cities'; id?: string; name: string; state: string }
  | { kind: 'terminals'; id?: string; code: string; name: string; cityId: string; address: string }

const URL: Record<TabKey, string> = {
  fuel: '/fleet/fuel-types',
  cities: '/fleet/cities',
  terminals: '/fleet/terminals',
}

const empty = (kind: TabKey): Draft =>
  kind === 'fuel'
    ? { kind, name: '', unit: 'L' }
    : kind === 'cities'
      ? { kind, name: '', state: '' }
      : { kind, code: '', name: '', cityId: '', address: '' }

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
  const [draft, setDraft] = useState<Draft | null>(null)

  const fuels = useFuelTypes(true)
  const cities = useCities(true)
  const terminals = useTerminals(true)

  const save = useMutation({
    mutationFn: async ({ kind, id, ...data }: Draft) => {
      const body = 'address' in data ? { ...data, address: data.address || null } : data
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
    mutationFn: ({ kind, id, isActive }: { kind: TabKey; id: string; isActive: boolean }) =>
      api.patch(`${URL[kind]}/${id}`, { isActive: !isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fleet'] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const actions = (kind: TabKey, row: { id: string; isActive: boolean }, edit: Draft) =>
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
    { header: 'Estado', cell: (t) => activeBadge(t.isActive) },
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
        }),
    },
  ]

  const cityColumns: Column<City>[] = [
    { header: 'Ciudad', cell: (c) => <span className="font-medium">{c.name}</span> },
    { header: 'Estado', cell: (c) => c.state },
    { header: 'Terminales', cell: (c) => <span className="font-data">{c._count?.terminals ?? 0}</span> },
    { header: 'Situación', cell: (c) => activeBadge(c.isActive) },
    { header: '', cell: (c) => actions('cities', c, { kind: 'cities', id: c.id, name: c.name, state: c.state }) },
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
          </>
        }
        bottom={<Tabs variant="band" items={TABS} value={tab} onChange={setTab} />}
      />

      {tab === 'terminals' && (
        <Table
          columns={terminalColumns}
          rows={terminals.data ?? []}
          rowKey={(t) => t.id}
          loading={terminals.isLoading}
          rowClassName={(t) => !t.isActive && 'opacity-60'}
          emptyIcon={Building2}
          emptyMessage="Aún no hay terminales"
          emptyDescription="Primero registra la ciudad y después su terminal"
        />
      )}
      {tab === 'cities' && (
        <Table
          columns={cityColumns}
          rows={cities.data ?? []}
          rowKey={(c) => c.id}
          loading={cities.isLoading}
          rowClassName={(c) => !c.isActive && 'opacity-60'}
          emptyIcon={MapPin}
          emptyMessage="Aún no hay ciudades"
        />
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
    </div>
  )
}

export default FleetCatalogsPage
