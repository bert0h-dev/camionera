import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, FileDown, Lock, Users, Wallet } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatMoney, formatTime, businessFormat } from '../../lib/format'
import type { CashCurrent, CashDetail, CashSession, Paginated } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { METHOD_LABELS } from '../tickets/useTickets'
import { CashCloseModal } from './CashCloseModal'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : '—')

const MOVEMENT = {
  sale: { label: 'Venta', sign: '+', tone: 'success' },
  refund: { label: 'Reembolso', sign: '−', tone: 'warning' },
  withdrawal: { label: 'Retiro', sign: '−', tone: 'danger' },
  deposit: { label: 'Ingreso', sign: '+', tone: 'info' },
} as const

/** Abre el PDF del corte en otra pestaña (lleva el token, por eso no es un enlace directo). */
async function openCashPdf(id: string) {
  const tab = window.open('', '_blank')
  const { data } = await api.get<Blob>(`/cash/${id}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const diffBadge = (s: CashSession) => {
  if (s.status === 'open')
    return (
      <Badge tone="info" dot>
        Abierta
      </Badge>
    )
  const d = Number(s.difference ?? 0)
  return d === 0 ? (
    <Badge tone="success" dot>
      Cuadró
    </Badge>
  ) : (
    <Badge tone={d < 0 ? 'danger' : 'warning'} dot>
      {d < 0 ? 'Faltante' : 'Sobrante'} {formatMoney(Math.abs(d))}
    </Badge>
  )
}

/** Totales y movimientos de una caja; los de una caja cerrada son los congelados en el corte. */
function CashSummary({ s }: { s: CashDetail }) {
  const closed = s.status === 'closed' && s.summary
  const t = closed ? s.summary!.totals : s.live.totals
  const rows: [string, number][] = [
    ['Fondo inicial', Number(s.openingFloat)],
    ['+ Ventas en efectivo', t.sales.cash],
    ['− Reembolsos en efectivo', t.refunds.cash],
    ['− Retiros', t.withdrawals],
    ['+ Ingresos', t.deposits],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Arqueo de efectivo</h3>
          <dl className="space-y-1 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="font-data">{formatMoney(value)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>Esperado</dt>
              <dd className="font-data">{formatMoney(closed ? s.expectedCash : t.expectedCash)}</dd>
            </div>
            {closed && (
              <>
                <div className="flex justify-between font-semibold">
                  <dt>Contado</dt>
                  <dd className="font-data">{formatMoney(s.countedCash)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Resultado</dt>
                  <dd>{diffBadge(s)}</dd>
                </div>
                {s.closingNotes && <p className="text-xs text-fg-muted">Motivo: {s.closingNotes}</p>}
              </>
            )}
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ventas por método</h3>
          <dl className="space-y-1 text-sm">
            {(['cash', 'card', 'transfer'] as const).map((m) => (
              <div key={m} className="flex justify-between">
                <dt className="text-fg-muted">{METHOD_LABELS[m]}</dt>
                <dd className="font-data">{formatMoney(t.sales[m] - t.refunds[m])}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>Vendido neto</dt>
              <dd className="font-data">{formatMoney(t.netSales)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">
                Comisión ({closed ? Number(s.commissionPercent) : s.live.commissionPercent} %)
              </dt>
              <dd className="font-data font-semibold">
                {formatMoney(closed ? s.commissionAmount : s.live.commission)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Movimientos</h3>
        {s.movements.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin movimientos todavía.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
            {s.movements.map((m) => {
              const k = MOVEMENT[m.type]
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-12 font-data text-xs text-fg-muted">{formatTime(m.createdAt)}</span>
                  <Badge tone={k.tone}>{k.label}</Badge>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">
                    {m.order ? `${m.order.orderNumber} · ${METHOD_LABELS[m.method]}` : (m.reason ?? '')}
                  </span>
                  <span className="font-data font-semibold">
                    {k.sign}
                    {formatMoney(m.amount)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Ficha de cualquier caja (supervisión o mis cortes) con PDF y, si sigue abierta, el corte. */
function CashDetailModal({ id, tolerance, onClose }: { id: string; tolerance: number; onClose: () => void }) {
  const toast = useToast()
  const [closing, setClosing] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['cash', 'detail', id],
    queryFn: async () => (await api.get<CashDetail>(`/cash/${id}`)).data,
  })
  const pdf = useMutation({
    mutationFn: () => openCashPdf(id),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  return (
    <>
      <Modal open={!closing} title={data ? `Caja de ${data.user.fullName}` : 'Caja'} size="xl" onClose={onClose}>
        {isLoading || !data ? (
          <LoadingBlock text="Cargando caja…" />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                Abrió <span className="font-data">{when(data.openedAt)}</span>
              </span>
              {data.closedAt && (
                <span>
                  Corte <span className="font-data">{when(data.closedAt)}</span>
                  {data.closedBy && data.closedBy.id !== data.userId && ` por ${data.closedBy.fullName}`}
                </span>
              )}
              {diffBadge(data)}
            </div>
            <CashSummary s={data} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={FileDown} loading={pdf.isPending} onClick={() => pdf.mutate()}>
                PDF del corte
              </Button>
              {data.status === 'open' && (
                <Button icon={Lock} onClick={() => setClosing(true)}>
                  Hacer corte
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      {closing && data && (
        <CashCloseModal
          session={data}
          tolerance={tolerance}
          onClose={() => setClosing(false)}
          onClosed={() => setClosing(false)}
        />
      )}
    </>
  )
}

function CashList({ userId, onOpen }: { userId?: string; onOpen: (id: string) => void }) {
  const mine = !!userId
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['cash', 'list', { userId, status, date, page }],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<Paginated<CashSession>>('/cash', {
          params: { userId, status: status || undefined, date: date || undefined, page, limit: 20 },
        })
      ).data,
  })
  const columns: Column<CashSession>[] = [
    ...(mine
      ? []
      : [{ header: 'Vendedor', cell: (s: CashSession) => <span className="font-medium">{s.user.fullName}</span> }]),
    { header: 'Abrió', cell: (s) => <span className="font-data text-sm">{when(s.openedAt)}</span> },
    { header: 'Corte', cell: (s) => <span className="font-data text-sm">{when(s.closedAt)}</span> },
    {
      header: 'Vendido',
      cell: (s) => <span className="font-data">{s.summary ? formatMoney(s.summary.totals.netSales) : '—'}</span>,
    },
    { header: 'Comisión', cell: (s) => <span className="font-data">{formatMoney(s.commissionAmount)}</span> },
    { header: 'Resultado', cell: (s) => diffBadge(s) },
    {
      header: '',
      cell: (s) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpen(s.id)}>
            Ver
          </Button>
        </div>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="w-full sm:w-44">
          <Select aria-label="Estado" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">Abiertas y cerradas</option>
            <option value="open">Abiertas</option>
            <option value="closed">Con corte</option>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Input
            type="date"
            aria-label="Día de apertura"
            value={date}
            onChange={(e) => (setDate(e.target.value), setPage(1))}
          />
        </div>
      </FilterBar>
      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => onOpen(s.id)}
        emptyIcon={Wallet}
        emptyMessage="Sin cajas con esos filtros"
      />
      {data && data.meta.totalPages > 1 && (
        <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
      )}
    </div>
  )
}

type TabKey = 'mine' | 'all'

/** Caja del vendedor: apertura, retiros e ingresos, corte con arqueo y comisión. Supervisión ve todas. */
function CashPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const supervises = user?.role === 'admin' || user?.role === 'supervisor'
  const cashier = user?.role !== 'supervisor'
  const [params, setParams] = useSearchParams()
  const detailId = params.get('id')
  const [tab, setTab] = useState<TabKey>(cashier ? 'mine' : 'all')
  const [float, setFloat] = useState<string | null>(null)
  const [move, setMove] = useState<{ type: 'withdrawal' | 'deposit'; amount: string; reason: string } | null>(null)
  const [closing, setClosing] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cash', 'current'],
    enabled: cashier,
    refetchInterval: 30_000,
    queryFn: async () => (await api.get<CashCurrent>('/cash/current')).data,
  })
  const s = data?.session ?? null
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cash'] })

  const open = useMutation({
    mutationFn: () => api.post('/cash/open', { openingFloat: Number(float ?? data?.defaultFloat ?? 0) }),
    onSuccess: () => {
      toast.success('Caja abierta')
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const movement = useMutation({
    mutationFn: () =>
      api.post('/cash/movements', { type: move!.type, amount: Number(move!.amount), reason: move!.reason }),
    onSuccess: () => {
      toast.success(move?.type === 'withdrawal' ? 'Retiro registrado' : 'Ingreso registrado')
      setMove(null)
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const tabs: TabItem<TabKey>[] = [
    ...(cashier ? [{ key: 'mine' as const, label: 'Mi caja', icon: Wallet }] : []),
    ...(supervises ? [{ key: 'all' as const, label: 'Todas las cajas', icon: Users }] : []),
  ]
  const t = s?.live.totals

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description={
          s
            ? `Abierta desde ${when(s.openedAt)} con ${formatMoney(s.openingFloat)} de fondo`
            : 'Apertura, retiros y corte de tu caja'
        }
        refreshing={isFetching && !isLoading}
        actions={
          s && (
            <>
              <Button
                variant="glass"
                icon={ArrowUpFromLine}
                onClick={() => setMove({ type: 'withdrawal', amount: '', reason: 'Envío a bóveda' })}
              >
                Retiro
              </Button>
              <Button
                variant="glass"
                icon={ArrowDownToLine}
                onClick={() => setMove({ type: 'deposit', amount: '', reason: 'Cambio adicional' })}
              >
                Ingreso
              </Button>
              <Button variant="accent" icon={Lock} onClick={() => setClosing(true)}>
                Hacer corte
              </Button>
            </>
          )
        }
        stats={
          s &&
          t && (
            <>
              <HeroStat
                label="Efectivo en caja"
                value={formatMoney(t.expectedCash)}
                tone="primary"
                hint="esperado ahora"
              />
              <HeroStat label="Vendido neto" value={formatMoney(t.netSales)} hint="todos los métodos" />
              <HeroStat label="Boletos" value={s.live.tickets} hint={`${s.live.orders} compra(s)`} />
              <HeroStat
                label="Comisión"
                value={formatMoney(s.live.commission)}
                hint={`${s.live.commissionPercent} % de lo vendido`}
                tone="success"
              />
            </>
          )
        }
        bottom={tabs.length > 1 ? <Tabs variant="band" items={tabs} value={tab} onChange={setTab} /> : undefined}
      />

      {tab === 'mine' && cashier && (
        <>
          {isLoading ? (
            <LoadingBlock text="Cargando caja…" />
          ) : !s ? (
            <Card className="max-w-xl">
              <CardHeader title="Abrir caja" description="Sin caja abierta no se puede cobrar en taquilla." />
              <CardBody>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    open.mutate()
                  }}
                >
                  <div className="w-48">
                    <Input
                      label="Fondo inicial"
                      type="number"
                      min={0}
                      step="0.01"
                      hint="Efectivo para dar cambio"
                      value={float ?? String(data?.defaultFloat ?? '')}
                      onChange={(e) => setFloat(e.target.value)}
                    />
                  </div>
                  <Button type="submit" icon={Wallet} loading={open.isPending}>
                    Abrir caja
                  </Button>
                </form>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <CashSummary s={s} />
              </CardBody>
            </Card>
          )}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Mis cortes</h2>
            <CashList userId={user?.id} onOpen={(id) => setParams({ id })} />
          </div>
        </>
      )}
      {tab === 'all' && supervises && (
        <>
          <Alert tone="info">
            Puedes hacer el corte de la caja de otro vendedor (por ejemplo, si se fue sin cortar): ábrela y cuenta el
            efectivo. Queda registrado que lo hiciste tú.
          </Alert>
          <CashList onOpen={(id) => setParams({ id })} />
        </>
      )}

      {detailId && <CashDetailModal id={detailId} tolerance={data?.tolerance ?? 0} onClose={() => setParams({})} />}
      {closing && s && (
        <CashCloseModal
          session={s}
          tolerance={data?.tolerance ?? 0}
          onClose={() => setClosing(false)}
          onClosed={(c) => {
            setClosing(false)
            setParams({ id: c.id })
          }}
        />
      )}
      <Modal
        open={!!move}
        title={move?.type === 'withdrawal' ? 'Retiro de efectivo' : 'Ingreso de efectivo'}
        onClose={() => setMove(null)}
      >
        {move && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              movement.mutate()
            }}
          >
            {move.type === 'withdrawal' && t && (
              <p className="text-sm text-fg-muted">Hay {formatMoney(t.expectedCash)} en efectivo en la caja.</p>
            )}
            <Input
              label="Importe"
              type="number"
              min={0.01}
              step="0.01"
              required
              value={move.amount}
              onChange={(e) => setMove({ ...move, amount: e.target.value })}
            />
            <Input
              label="Motivo"
              required
              minLength={3}
              value={move.reason}
              onChange={(e) => setMove({ ...move, reason: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMove(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={movement.isPending}>
                Registrar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default CashPage
