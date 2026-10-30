import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgePercent, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatMoney, todayKey } from '../../lib/format'
import type { Promotion, PromotionStatus } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'

const STATUS: Record<PromotionStatus, { label: string; tone: BadgeTone }> = {
  current: { label: 'Vigente', tone: 'success' },
  upcoming: { label: 'Por empezar', tone: 'info' },
  ended: { label: 'Terminada', tone: 'neutral' },
  exhausted: { label: 'Agotada', tone: 'warning' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )

interface Draft {
  id?: string
  code: string
  name: string
  description: string
  discountType: 'percent' | 'amount'
  discountValue: string
  maxDiscount: string
  maxUses: string
  minPurchase: string
  validFrom: string
  validUntil: string
  channel: 'all' | 'counter' | 'online'
}

const empty = (): Draft => ({
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: '10',
  maxDiscount: '',
  maxUses: '',
  minPurchase: '0',
  validFrom: todayKey(),
  validUntil: todayKey(),
  channel: 'all',
})

const draftOf = (p: Promotion): Draft => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description ?? '',
  discountType: p.discountType,
  discountValue: String(Number(p.discountValue)),
  maxDiscount: p.maxDiscount ? String(Number(p.maxDiscount)) : '',
  maxUses: p.maxUses ? String(p.maxUses) : '',
  minPurchase: String(Number(p.minPurchase)),
  validFrom: p.validFrom.slice(0, 10),
  validUntil: p.validUntil.slice(0, 10),
  channel: p.channels.length === 1 ? p.channels[0] : 'all',
})

const discountLabel = (p: Promotion) =>
  p.discountType === 'percent'
    ? `${Number(p.discountValue)} %${p.maxDiscount ? ` (tope ${formatMoney(p.maxDiscount)})` : ''}`
    : formatMoney(p.discountValue)

/** Códigos de descuento: los crean admin y coordinación; taquilla los aplica al cobrar. */
function PromotionsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'coordinator'
  const [draft, setDraft] = useState<Draft | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'promotions'],
    queryFn: async () => (await api.get<Promotion[]>('/tickets/promotions')).data,
  })
  const rows = data ?? []

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        code: d.code,
        name: d.name,
        description: d.description || null,
        discountType: d.discountType,
        discountValue: Number(d.discountValue),
        maxDiscount: d.discountType === 'percent' && d.maxDiscount ? Number(d.maxDiscount) : null,
        maxUses: d.maxUses ? Number(d.maxUses) : null,
        minPurchase: Number(d.minPurchase || 0),
        validFrom: d.validFrom,
        validUntil: d.validUntil,
        channels: d.channel === 'all' ? [] : [d.channel],
      }
      if (d.id) await api.patch(`/tickets/promotions/${d.id}`, body)
      else await api.post('/tickets/promotions', body)
    },
    onSuccess: () => {
      toast.success('Promoción guardada')
      queryClient.invalidateQueries({ queryKey: ['tickets', 'promotions'] })
      setDraft(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const toggle = useMutation({
    mutationFn: (p: Promotion) => api.patch(`/tickets/promotions/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', 'promotions'] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const columns: Column<Promotion>[] = [
    {
      header: 'Clave',
      cell: (p) => (
        <div>
          <div className="font-data font-semibold">{p.code}</div>
          <div className="text-xs text-fg-muted">{p.name}</div>
        </div>
      ),
    },
    { header: 'Descuento', cell: (p) => <span className="font-data">{discountLabel(p)}</span> },
    {
      header: 'Vigencia',
      cell: (p) => (
        <span className="text-sm">
          {dateLabel(p.validFrom)} – {dateLabel(p.validUntil)}
        </span>
      ),
    },
    {
      header: 'Condiciones',
      cell: (p) => (
        <span className="text-xs text-fg-muted">
          {[
            Number(p.minPurchase) > 0 && `mínimo ${formatMoney(p.minPurchase)}`,
            p.channels.length === 1 && (p.channels[0] === 'counter' ? 'solo taquilla' : 'solo en línea'),
          ]
            .filter(Boolean)
            .join(' · ') || 'Sin condiciones'}
        </span>
      ),
    },
    {
      header: 'Usos',
      cell: (p) => (
        <span className="font-data">
          {p.usesCount}
          {p.maxUses ? `/${p.maxUses}` : ''}
        </span>
      ),
    },
    { header: 'Descuento otorgado', cell: (p) => <span className="font-data">{formatMoney(p.discountGiven)}</span> },
    {
      header: 'Estado',
      cell: (p) => (
        <Badge tone={STATUS[p.status].tone} dot>
          {STATUS[p.status].label}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (p) =>
        canEdit && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDraft(draftOf(p))}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(p)}>
              {p.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ]

  const current = rows.filter((p) => p.status === 'current')
  return (
    <div className="space-y-6">
      <PageHeader
        title="Promociones"
        description="Códigos de descuento que taquilla aplica al cobrar; se suman al descuento por tipo de pasajero"
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => setDraft(empty())}>
              Nueva promoción
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Vigentes"
              value={current.length}
              tone="primary"
              loading={isLoading}
              hint="se pueden usar hoy"
            />
            <HeroStat
              label="Usos"
              value={rows.reduce((a, p) => a + p.usesCount, 0)}
              loading={isLoading}
              hint="compras cobradas con promoción"
            />
            <HeroStat
              label="Descuento otorgado"
              value={formatMoney(rows.reduce((a, p) => a + p.discountGiven, 0))}
              loading={isLoading}
              hint="en total"
            />
          </>
        }
      />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={isLoading}
        rowClassName={(p) => p.status !== 'current' && 'opacity-70'}
        emptyIcon={BadgePercent}
        emptyMessage="Aún no hay promociones"
      />

      <Modal
        open={!!draft}
        title={draft?.id ? 'Editar promoción' : 'Nueva promoción'}
        size="lg"
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
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Input
                label="Clave"
                required
                className="font-data uppercase"
                hint="La escribe el cliente o la taquilla"
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Tipo"
                value={draft.discountType}
                onChange={(e) => setDraft({ ...draft, discountType: e.target.value as Draft['discountType'] })}
              >
                <option value="percent">Porcentaje</option>
                <option value="amount">Monto fijo</option>
              </Select>
              <Input
                label={draft.discountType === 'percent' ? 'Porcentaje' : 'Monto'}
                type="number"
                required
                min={0.01}
                max={draft.discountType === 'percent' ? 100 : undefined}
                step="0.01"
                value={draft.discountValue}
                onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
              />
              {draft.discountType === 'percent' && (
                <Input
                  label="Tope"
                  type="number"
                  min={0.01}
                  step="0.01"
                  hint="Opcional, en pesos"
                  value={draft.maxDiscount}
                  onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })}
                />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Desde"
                type="date"
                required
                value={draft.validFrom}
                onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
              />
              <Input
                label="Hasta"
                type="date"
                required
                min={draft.validFrom}
                value={draft.validUntil}
                onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Usos máximos"
                type="number"
                min={1}
                hint="Vacío = sin límite"
                value={draft.maxUses}
                onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
              />
              <Input
                label="Compra mínima"
                type="number"
                min={0}
                step="0.01"
                value={draft.minPurchase}
                onChange={(e) => setDraft({ ...draft, minPurchase: e.target.value })}
              />
              <Select
                label="Canal"
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value as Draft['channel'] })}
              >
                <option value="all">Taquilla y en línea</option>
                <option value="counter">Solo taquilla</option>
                <option value="online">Solo en línea</option>
              </Select>
            </div>
            <Textarea
              label="Descripción"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <p className="text-xs text-fg-muted">
              El descuento se aplica sobre el importe ya con el descuento por tipo de pasajero, y el uso se cuenta al
              cobrar.
            </p>
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

export default PromotionsPage
