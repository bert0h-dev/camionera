import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { PassengerType, SeasonType } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { SEASON_LABELS } from '../routes/useRoutes'

interface Draft {
  id?: string
  code: string
  name: string
  discountPercent: string
  maxPerTrip: string
  requiresId: boolean
  seasonTypes: SeasonType[]
  isDefault: boolean
}

const EMPTY: Draft = {
  code: '',
  name: '',
  discountPercent: '0',
  maxPerTrip: '',
  requiresId: false,
  seasonTypes: [],
  isDefault: false,
}

const draftOf = (t: PassengerType): Draft => ({
  id: t.id,
  code: t.code,
  name: t.name,
  discountPercent: String(Number(t.discountPercent)),
  maxPerTrip: t.maxPerTrip == null ? '' : String(t.maxPerTrip),
  requiresId: t.requiresId,
  seasonTypes: t.seasonTypes,
  isDefault: t.isDefault,
})

const seasonsText = (types: SeasonType[]) =>
  types.length ? `Solo en temporada ${types.map((t) => SEASON_LABELS[t].toLowerCase()).join(' o ')}` : 'Siempre'

/** Catálogo de tipos de pasajero con su descuento; vive en Parámetros › Boletos. */
export function PassengerTypesCard() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'passenger-types', 'all'],
    queryFn: async () => (await api.get<PassengerType[]>('/tickets/passenger-types?includeInactive=true')).data,
  })

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        code: d.code,
        name: d.name,
        discountPercent: Number(d.discountPercent),
        maxPerTrip: d.maxPerTrip ? Number(d.maxPerTrip) : null,
        requiresId: d.requiresId,
        seasonTypes: d.seasonTypes,
        isDefault: d.isDefault,
      }
      if (d.id) await api.patch(`/tickets/passenger-types/${d.id}`, body)
      else await api.post('/tickets/passenger-types', body)
    },
    onSuccess: () => {
      toast.success('Cambios guardados')
      queryClient.invalidateQueries({ queryKey: ['tickets', 'passenger-types'] })
      setDraft(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggle = useMutation({
    mutationFn: (t: PassengerType) => api.patch(`/tickets/passenger-types/${t.id}`, { isActive: !t.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', 'passenger-types'] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const columns: Column<PassengerType>[] = [
    {
      header: 'Tipo',
      cell: (t) => (
        <div>
          <div className="flex items-center gap-2 font-medium">
            {t.name}
            {t.isDefault && <Badge tone="primary">predeterminado</Badge>}
          </div>
          <div className="font-data text-xs text-fg-muted">{t.code}</div>
        </div>
      ),
    },
    {
      header: 'Descuento',
      cell: (t) => <span className="font-data font-semibold">{Number(t.discountPercent)} %</span>,
    },
    { header: 'Aplica', cell: (t) => <span className="text-sm">{seasonsText(t.seasonTypes)}</span> },
    {
      header: 'Cupo por recorrido',
      cell: (t) =>
        t.maxPerTrip == null ? (
          <span className="text-fg-subtle">Sin cupo</span>
        ) : (
          <span className="font-data">{t.maxPerTrip}</span>
        ),
    },
    {
      header: 'Credencial',
      cell: (t) =>
        t.requiresId ? <Badge tone="warning">se pide al abordar</Badge> : <span className="text-fg-subtle">—</span>,
    },
    {
      header: 'Estado',
      cell: (t) => (
        <Badge tone={t.isActive ? 'success' : 'neutral'} dot>
          {t.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDraft(draftOf(t))}>
            Editar
          </Button>
          {!t.isDefault && (
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(t)}>
              {t.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="size-4 text-fg-subtle" />
            Tipos de pasajero
          </span>
        }
        description="Descuento de cada tipo sobre la tarifa del tramo. El precio se congela en el boleto al venderlo."
        actions={
          <Button size="sm" icon={Plus} onClick={() => setDraft(EMPTY)}>
            Nuevo tipo
          </Button>
        }
      />
      <CardBody>
        <Table
          columns={columns}
          rows={data ?? []}
          rowKey={(t) => t.id}
          loading={isLoading}
          rowClassName={(t) => !t.isActive && 'opacity-60'}
          emptyIcon={Users}
          emptyMessage="Aún no hay tipos de pasajero"
        />
      </CardBody>

      <Modal
        open={!!draft}
        title={draft?.id ? 'Editar tipo de pasajero' : 'Nuevo tipo de pasajero'}
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
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <Input
                label="Clave"
                required
                maxLength={20}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Descuento"
                type="number"
                required
                min={0}
                max={100}
                step="0.01"
                hint="% sobre la tarifa del tramo"
                value={draft.discountPercent}
                onChange={(e) => setDraft({ ...draft, discountPercent: e.target.value })}
              />
              <Input
                label="Cupo por recorrido"
                type="number"
                min={1}
                max={100}
                hint="Vacío = sin cupo"
                value={draft.maxPerTrip}
                onChange={(e) => setDraft({ ...draft, maxPerTrip: e.target.value })}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-fg">El descuento aplica</legend>
              <p className="text-xs text-fg-muted">
                Sin marcar ninguna, aplica siempre. Si marcas temporadas, solo cuando la fecha del viaje cae en una de
                ellas (Rutas › Temporadas).
              </p>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(SEASON_LABELS) as SeasonType[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-indigo-600"
                      checked={draft.seasonTypes.includes(s)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          seasonTypes: e.target.checked
                            ? [...draft.seasonTypes, s]
                            : draft.seasonTypes.filter((x) => x !== s),
                        })
                      }
                    />
                    {SEASON_LABELS[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-indigo-600"
                checked={draft.requiresId}
                onChange={(e) => setDraft({ ...draft, requiresId: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-medium text-fg">Pide credencial al abordar</span>
                <span className="block text-xs text-fg-muted">INAPAM, credencial escolar, etc.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-indigo-600"
                checked={draft.isDefault}
                onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-medium text-fg">Predeterminado</span>
                <span className="block text-xs text-fg-muted">Se propone al capturar cada pasajero</span>
              </span>
            </label>
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
    </Card>
  )
}
