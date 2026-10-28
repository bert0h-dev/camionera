import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, todayKey } from '../../lib/format'
import type { Season, SeasonStatus, SeasonType } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { SEASON_LABELS, formatPercent, useCanEditRoutes, useSeasonSummary, useSeasons } from './useRoutes'

const TYPE_STYLE: Record<SeasonType, { bar: string; tone: BadgeTone }> = {
  low: { bar: 'bg-sky-400/80', tone: 'info' },
  normal: { bar: 'bg-slate-400/70', tone: 'neutral' },
  high: { bar: 'bg-amber-400/90', tone: 'warning' },
  holiday: { bar: 'bg-rose-500/80', tone: 'danger' },
}

const STATUS: Record<SeasonStatus, { label: string; tone: BadgeTone }> = {
  current: { label: 'Vigente', tone: 'success' },
  upcoming: { label: 'Próxima', tone: 'info' },
  past: { label: 'Pasada', tone: 'neutral' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
}

// Signo que exige cada tipo; al elegir el tipo se propone un valor
const DEFAULT_PCT: Record<SeasonType, string> = { low: '-10', normal: '0', high: '10', holiday: '20' }
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const EXAMPLE_PRICE = 820

const DAY = 86_400_000
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`)

/** Franja anual: cada temporada activa como barra sobre el año, coloreada por tipo. */
function YearStrip({ year, seasons }: { year: number; seasons: Season[] }) {
  const start = ms(`${year}-01-01`)
  const total = ms(`${year + 1}-01-01`) - start
  const pos = (key: string) => Math.min(100, Math.max(0, ((ms(key) - start) / total) * 100))
  const today = todayKey()
  const showToday = today.startsWith(String(year))
  return (
    <div className="space-y-2">
      <div className="relative h-10 overflow-hidden rounded-lg bg-surface-sunken">
        {seasons
          .filter((s) => s.isActive)
          .map((s) => {
            const left = pos(s.validFrom)
            const right = pos(new Date(ms(s.validUntil) + DAY).toISOString().slice(0, 10))
            return (
              <div
                key={s.id}
                title={`${s.name} · ${formatPercent(s.priceModifierPercent)} · ${formatDate(s.validFrom)} – ${formatDate(s.validUntil)}`}
                className={cn('absolute inset-y-1 rounded-md', TYPE_STYLE[s.seasonType].bar)}
                style={{ left: `${left}%`, width: `${Math.max(0.6, right - left)}%` }}
              />
            )
          })}
        {showToday && <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${pos(today)}%` }} title="Hoy" />}
      </div>
      <div className="grid grid-cols-12 text-center text-[11px] text-fg-muted">
        {MONTHS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-fg-muted">
        {(Object.keys(SEASON_LABELS) as SeasonType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', TYPE_STYLE[t].bar)} />
            {SEASON_LABELS[t]}
          </span>
        ))}
      </div>
    </div>
  )
}

interface Draft {
  name: string
  seasonType: SeasonType
  validFrom: string
  validUntil: string
  pct: string
  description: string
}

const toDraft = (s: Season | null): Draft =>
  s
    ? {
        name: s.name,
        seasonType: s.seasonType,
        validFrom: s.validFrom,
        validUntil: s.validUntil,
        pct: String(s.priceModifierPercent),
        description: s.description ?? '',
      }
    : { name: '', seasonType: 'high', validFrom: '', validUntil: '', pct: DEFAULT_PCT.high, description: '' }

function SeasonModal({ season, onClose }: { season: Season | null | undefined; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(season ?? null))
  const [prev, setPrev] = useState(season)
  if (prev !== season) {
    setPrev(season)
    setDraft(toDraft(season ?? null))
  }
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const pct = Number(draft.pct || 0)
  const signError =
    draft.seasonType === 'low' && !(pct < 0)
      ? 'La temporada baja resta: usa un porcentaje negativo'
      : (draft.seasonType === 'high' || draft.seasonType === 'holiday') && !(pct > 0)
        ? 'Debe sumar: usa un porcentaje positivo'
        : draft.seasonType === 'normal' && pct !== 0
          ? 'La temporada normal no lleva ajuste'
          : undefined

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name,
        seasonType: draft.seasonType,
        validFrom: draft.validFrom,
        validUntil: draft.validUntil,
        priceModifierPercent: pct,
        description: draft.description || null,
      }
      if (season) await api.patch(`/seasons/${season.id}`, body)
      else await api.post('/seasons', body)
    },
    onSuccess: () => {
      toast.success(season ? 'Temporada actualizada' : 'Temporada creada')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={season !== undefined} title={season ? 'Editar temporada' : 'Nueva temporada'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Input label="Nombre" required value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo"
            value={draft.seasonType}
            onChange={(e) => {
              const t = e.target.value as SeasonType
              set({ seasonType: t, pct: DEFAULT_PCT[t] })
            }}
          >
            {(Object.keys(SEASON_LABELS) as SeasonType[]).map((t) => (
              <option key={t} value={t}>
                {SEASON_LABELS[t]}
              </option>
            ))}
          </Select>
          <Input
            label="Ajuste al precio (%)"
            required
            type="number"
            step="0.01"
            min={-90}
            max={200}
            disabled={draft.seasonType === 'normal'}
            error={signError}
            hint={
              signError
                ? undefined
                : `Ejemplo: ${formatMoney(EXAMPLE_PRICE)} → ${formatMoney(Math.round(EXAMPLE_PRICE * (1 + pct / 100)))}`
            }
            value={draft.pct}
            onChange={(e) => set({ pct: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Desde"
            type="date"
            required
            value={draft.validFrom}
            onChange={(e) => set({ validFrom: e.target.value })}
          />
          <Input
            label="Hasta"
            type="date"
            required
            min={draft.validFrom}
            hint="Incluye este día"
            value={draft.validUntil}
            onChange={(e) => set({ validUntil: e.target.value })}
          />
        </div>
        <Textarea
          label="Descripción"
          rows={2}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <p className="text-xs text-fg-muted">
          Aplica a todas las rutas según la fecha del viaje. El precio final se redondea a peso entero.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!!signError}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SeasonsPage() {
  const canEdit = useCanEditRoutes()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [year, setYear] = useState(() => Number(todayKey().slice(0, 4)))
  const [editing, setEditing] = useState<Season | null | undefined>(() =>
    params.get('nueva') && canEdit ? null : undefined,
  )
  const [deleting, setDeleting] = useState<Season | null>(null)
  const { data, isLoading, isFetching } = useSeasons(year)
  const summary = useSeasonSummary()
  const s = summary.data
  const today = todayKey()
  const daysTo = (key: string) => Math.round((ms(key) - ms(today)) / DAY)

  const toggle = useMutation({
    mutationFn: (season: Season) => api.patch(`/seasons/${season.id}`, { isActive: !season.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: (season: Season) => api.delete(`/seasons/${season.id}`),
    onSuccess: () => {
      toast.success('Temporada eliminada')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const rows = data ?? []
  const columns: Column<Season>[] = [
    {
      header: 'Temporada',
      cell: (x) => (
        <div>
          <div className="font-medium">{x.name}</div>
          {x.description && <div className="text-xs text-fg-muted">{x.description}</div>}
        </div>
      ),
    },
    { header: 'Tipo', cell: (x) => <Badge tone={TYPE_STYLE[x.seasonType].tone}>{SEASON_LABELS[x.seasonType]}</Badge> },
    {
      header: 'Fechas',
      cell: (x) => (
        <span className="text-sm">
          {formatDate(x.validFrom)} – {formatDate(x.validUntil)}
          <span className="block text-xs text-fg-muted">{daysTo(x.validUntil) - daysTo(x.validFrom) + 1} días</span>
        </span>
      ),
    },
    {
      header: 'Ajuste',
      cell: (x) => <span className="font-data font-semibold">{formatPercent(x.priceModifierPercent)}</span>,
    },
    {
      header: 'Situación',
      cell: (x) => (
        <Badge tone={STATUS[x.status].tone} dot>
          {STATUS[x.status].label}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (x) =>
        canEdit && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(x)}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(x)}>
              {x.isActive ? 'Desactivar' : 'Activar'}
            </Button>
            {x.canDelete && (
              <Button variant="ghost" size="sm" onClick={() => setDeleting(x)}>
                Eliminar
              </Button>
            )}
          </div>
        ),
    },
  ]

  const closeModal = () => {
    setEditing(undefined)
    if (params.has('nueva')) setParams({}, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Temporadas"
        description="Ajustes de precio para todas las rutas según la fecha del viaje; el precio final se redondea a peso entero"
        refreshing={isFetching && !isLoading}
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => setEditing(null)}>
              Nueva temporada
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Vigente hoy"
              value={s?.current ? formatPercent(s.current.priceModifierPercent) : 'Sin ajuste'}
              tone={s?.current ? 'primary' : 'neutral'}
              loading={summary.isLoading}
              hint={s?.current ? `${s.current.name} · hasta ${formatDate(s.current.validUntil)}` : 'precio de la ruta'}
            />
            <HeroStat
              label="Próxima"
              value={s?.next ? formatPercent(s.next.priceModifierPercent) : '—'}
              loading={summary.isLoading}
              hint={s?.next ? `${s.next.name} · empieza en ${daysTo(s.next.validFrom)} días` : 'ninguna programada'}
            />
            <HeroStat
              label={`Temporadas ${year}`}
              value={rows.filter((x) => x.isActive).length}
              loading={isLoading}
              hint="activas que tocan el año"
            />
            <HeroStat
              label="Días con ajuste"
              value={rows
                .filter((x) => x.isActive)
                .reduce((n, x) => {
                  const from = x.validFrom < `${year}-01-01` ? `${year}-01-01` : x.validFrom
                  const until = x.validUntil > `${year}-12-31` ? `${year}-12-31` : x.validUntil
                  return n + daysTo(until) - daysTo(from) + 1
                }, 0)}
              loading={isLoading}
              hint={`del año ${year}`}
            />
          </>
        }
      />

      <Card>
        <CardHeader
          title={`Calendario ${year}`}
          description="Temporadas activas a lo largo del año; la línea marca hoy"
          actions={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                icon={ChevronLeft}
                aria-label="Año anterior"
                onClick={() => setYear(year - 1)}
              />
              <span className="w-12 text-center font-data font-semibold">{year}</span>
              <Button
                variant="ghost"
                size="icon"
                icon={ChevronRight}
                aria-label="Año siguiente"
                onClick={() => setYear(year + 1)}
              />
            </div>
          }
        />
        <CardBody>
          <YearStrip year={year} seasons={rows} />
        </CardBody>
      </Card>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(x) => x.id}
        loading={isLoading}
        rowClassName={(x) => (x.status === 'past' || x.status === 'inactive') && 'opacity-60'}
        emptyIcon={CalendarRange}
        emptyMessage={`No hay temporadas en ${year}`}
        emptyDescription={canEdit ? 'Sin temporada, cada ruta cobra su precio' : undefined}
      />

      {canEdit && <SeasonModal season={editing} onClose={closeModal} />}
      <ConfirmModal
        open={!!deleting}
        title="Eliminar temporada"
        message={deleting ? `Se eliminará "${deleting.name}". Si solo quieres suspenderla, desactívala.` : ''}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

export default SeasonsPage
