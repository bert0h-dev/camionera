import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { FileDown, Mail, Receipt, Search } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, dayLabel, formatMoney, formatTime, todayKey } from '../../lib/format'
import type { CashCurrent, Paginated, SaleListItem } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { BandStepper } from '../../components/ui/BandStepper'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { METHOD_LABELS, openOrderPdf } from './useTickets'

type SalesResponse = Paginated<SaleListItem> & { summary: { date: string; orders: number; total: number } }

/** Ventas del día: el vendedor ve las suyas; supervisión y admin, todas. Reimprimir o reenviar boletos. */
function SalesPage() {
  const toast = useToast()
  const { user } = useAuth()
  const seesAll = user?.role === 'admin' || user?.role === 'supervisor'
  const [params, setParams] = useSearchParams()
  const date = params.get('fecha') ?? todayKey()
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState(!seesAll)
  const [page, setPage] = useState(1)
  const [sendTo, setSendTo] = useState<{ order: SaleListItem; email: string } | null>(null)

  const setDate = (d: string) => {
    setParams({ fecha: d }, { replace: true })
    setPage(1)
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['tickets', 'orders', { date, search, mine, page }],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<SalesResponse>('/tickets/orders', {
          params: { date, search: search || undefined, mine: mine || undefined, page, limit: 20 },
        })
      ).data,
  })
  const cash = useQuery({
    queryKey: ['cash', 'current'],
    enabled: user?.role !== 'supervisor',
    queryFn: async () => (await api.get<CashCurrent>('/cash/current')).data,
  })
  const pdf = useMutation({
    mutationFn: (id: string) => openOrderPdf(id),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const send = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) =>
      (await api.post<{ to: string; sent: boolean }>(`/tickets/orders/${id}/send`, { email })).data,
    onSuccess: (r) => {
      toast.success(r.sent ? `Boletos enviados a ${r.to}` : 'El envío de correo no está configurado')
      setSendTo(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const rows = data?.data ?? []
  const tickets = rows.reduce((a, o) => a + o.tickets.length, 0)
  const columns: Column<SaleListItem>[] = [
    { header: 'Hora', cell: (o) => <span className="font-data">{formatTime(o.paidAt)}</span> },
    { header: 'Compra', cell: (o) => <span className="font-data font-semibold">{o.orderNumber}</span> },
    {
      header: 'Pasajeros',
      cell: (o) => (
        <div className="space-y-0.5 text-sm">
          {o.tickets.map((t) => (
            <div key={t.id} className="flex gap-2">
              <span className="w-6 text-right font-data text-fg-muted">{t.seatNumber}</span>
              <span className="truncate">{t.passengerName}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      header: 'Viaje',
      cell: (o) => (
        <div className="text-sm">
          <div className="font-data">
            {o.tickets[0]?.boardTerminal.code} → {o.tickets[0]?.alightTerminal.code}
          </div>
          <div className="font-data text-xs text-fg-muted">{o.tickets[0]?.trip.tripNumber}</div>
        </div>
      ),
    },
    {
      header: 'Pago',
      cell: (o) => (
        <div className="flex flex-wrap gap-1">
          {o.payments.map((p, i) => (
            <Badge key={i}>{METHOD_LABELS[p.method]}</Badge>
          ))}
        </div>
      ),
    },
    ...(seesAll && !mine
      ? [
          {
            header: 'Vendedor',
            cell: (o: SaleListItem) => <span className="text-sm">{o.seller?.fullName ?? '—'}</span>,
          },
        ]
      : []),
    {
      header: 'Total',
      cell: (o) => <span className="font-data font-semibold">{formatMoney(o.total)}</span>,
      className: 'text-right',
    },
    {
      header: '',
      cell: (o) =>
        o.status === 'paid' && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" icon={FileDown} onClick={() => pdf.mutate(o.id)}>
              PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Mail}
              onClick={() => setSendTo({ order: o, email: o.contactEmail ?? '' })}
            >
              Correo
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description={seesAll ? 'Compras cobradas del día en taquilla' : 'Tus ventas del día en taquilla'}
        refreshing={isFetching && !isLoading}
        actions={
          <BandStepper
            label={dayLabel(date)}
            onPrev={() => setDate(addDaysKey(date, -1))}
            onNext={() => setDate(addDaysKey(date, 1))}
            nextDisabled={date >= todayKey()}
            todayLabel="Hoy"
            onToday={() => setDate(todayKey())}
            isToday={date === todayKey()}
            prevLabel="Día anterior"
            nextLabel="Día siguiente"
          />
        }
        stats={
          <>
            <HeroStat
              label="Vendido"
              value={formatMoney(data?.summary.total ?? 0)}
              tone="primary"
              loading={isLoading}
              hint={mine ? 'tus ventas' : 'todos los vendedores'}
            />
            <HeroStat label="Compras" value={data?.summary.orders ?? 0} loading={isLoading} hint="cobradas" />
            <HeroStat label="Boletos" value={tickets} loading={isLoading} hint="en esta página" />
            {cash.data && (
              <HeroStat
                label="Mi caja"
                value={cash.data.session ? formatMoney(cash.data.session.live.totals.expectedCash) : 'Cerrada'}
                hint={cash.data.session ? 'efectivo esperado' : 'ábrela para cobrar'}
                tone={cash.data.session ? 'neutral' : 'warning'}
                to="/caja"
              />
            )}
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por folio de compra o boleto, pasajero o correo…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {seesAll && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked)
                setPage(1)
              }}
            />
            Solo mis ventas
          </label>
        )}
      </FilterBar>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={isLoading}
        emptyIcon={Receipt}
        emptyMessage={search ? 'Ninguna venta coincide' : `Sin ventas el ${dayLabel(date)}`}
      />
      {data && data.meta.totalPages > 1 && (
        <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
      )}

      <Modal open={!!sendTo} title="Mandar boletos por correo" onClose={() => setSendTo(null)}>
        {sendTo && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate({ id: sendTo.order.id, email: sendTo.email })
            }}
          >
            <p className="text-sm text-fg-muted">
              Compra <span className="font-data font-semibold text-fg">{sendTo.order.orderNumber}</span> ·{' '}
              {sendTo.order.tickets.length} boleto(s)
            </p>
            <Input
              label="Correo"
              type="email"
              required
              value={sendTo.email}
              onChange={(e) => setSendTo({ ...sendTo, email: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSendTo(null)}>
                Cancelar
              </Button>
              <Button type="submit" icon={Mail} loading={send.isPending}>
                Enviar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default SalesPage
