import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Contact, Search } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatMoney } from '../../lib/format'
import type { Customer, CustomerDetail, Paginated, TicketStatus } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })
const DAY = businessFormat({ dateStyle: 'medium' })
const when = (iso: string | null | undefined) => (iso ? WHEN.format(new Date(iso)) : '—')

const TICKET: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  held: { label: 'Apartado', tone: 'warning' },
  confirmed: { label: 'Por viajar', tone: 'success' },
  checked_in: { label: 'Viajó', tone: 'info' },
  no_show: { label: 'No se presentó', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
  changed: { label: 'Cambiado', tone: 'neutral' },
}

/** Ficha del cliente: datos editables, cifras y sus compras con liga a cada una en Ventas. */
function CustomerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [edit, setEdit] = useState<{ fullName: string; email: string; phone: string; notes: string } | null>(null)
  const { data: c, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: async () => (await api.get<CustomerDetail>(`/customers/${id}`)).data,
  })
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${id}`, {
        fullName: edit!.fullName,
        email: edit!.email || null,
        phone: edit!.phone || null,
        notes: edit!.notes || null,
      }),
    onSuccess: () => {
      toast.success('Cliente actualizado')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setEdit(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open title={c?.fullName ?? 'Cliente'} size="xl" onClose={onClose}>
      {isLoading || !c ? (
        <LoadingBlock text="Cargando cliente…" />
      ) : (
        <div className="space-y-5">
          {edit ? (
            <form
              className="grid gap-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <Input
                label="Nombre"
                required
                value={edit.fullName}
                onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
              />
              <Input
                label="Correo"
                type="email"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              />
              <Input
                label="Teléfono"
                value={edit.phone}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
              <div className="sm:col-span-3">
                <Textarea
                  label="Notas"
                  rows={2}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button variant="secondary" onClick={() => setEdit(null)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={save.isPending}>
                  Guardar
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>{c.email ?? 'Sin correo'}</span>
              <span>{c.phone ?? 'Sin teléfono'}</span>
              <span className="text-fg-muted">Cliente desde {DAY.format(new Date(c.createdAt))}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setEdit({ fullName: c.fullName, email: c.email ?? '', phone: c.phone ?? '', notes: c.notes ?? '' })
                }
              >
                Editar datos
              </Button>
              {c.notes && <p className="w-full text-fg-muted">{c.notes}</p>}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-band p-4 text-white sm:grid-cols-5">
            {(
              [
                ['Gastado', formatMoney(c.stats.spent)],
                ['Compras', c.stats.orders],
                ['Viajó', c.stats.boarded],
                ['Por viajar', c.stats.upcoming],
                ['Cancelados / no se presentó', `${c.stats.cancelled} / ${c.stats.noShow}`],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-indigo-200">{label}</dt>
                <dd className="font-data text-xl font-bold text-amber-400">{value}</dd>
              </div>
            ))}
          </dl>
          {c.stats.lastTripAt && <p className="text-sm text-fg-muted">Último viaje: {when(c.stats.lastTripAt)}</p>}

          <ul className="space-y-2">
            {c.orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                  <Link to={`/ventas?compra=${o.id}`} className="font-data font-semibold text-link hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="text-fg-muted">{when(o.paidAt)}</span>
                  <span className="ml-auto font-data">{formatMoney(o.total)}</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {o.tickets.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3">
                      <span className="w-6 text-right font-data text-fg-muted">{t.seatNumber}</span>
                      <span className="min-w-32 flex-1">{t.passengerName}</span>
                      <span className="font-data text-xs">
                        {t.boardTerminal.code} → {t.alightTerminal.code} · {DAY.format(new Date(t.boardAt))}
                      </span>
                      <Badge tone={TICKET[t.status].tone}>{TICKET[t.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!c.orders.length && <p className="text-sm text-fg-muted">Sin compras.</p>}
          </ul>
        </div>
      )}
    </Modal>
  )
}

/** Clientes: quien compra (con correo o teléfono); se crean solos al vender. */
function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('id')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', 'list', { search, page }],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<Paginated<Customer>>('/customers', { params: { search: search || undefined, page, limit: 20 } }))
        .data,
  })
  const columns: Column<Customer>[] = [
    { header: 'Cliente', cell: (c) => <span className="font-medium">{c.fullName}</span> },
    { header: 'Correo', cell: (c) => c.email ?? <span className="text-fg-subtle">—</span> },
    { header: 'Teléfono', cell: (c) => c.phone ?? <span className="text-fg-subtle">—</span> },
    { header: 'Compras', cell: (c) => <span className="font-data">{c._count?.orders ?? 0}</span> },
    { header: 'Última compra', cell: (c) => <span className="text-sm">{when(c.lastPurchaseAt)}</span> },
  ]
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Quien compra con correo o teléfono queda aquí, con su historial de viajes"
        refreshing={isFetching && !isLoading}
      />
      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por nombre, correo o teléfono…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </FilterBar>
      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={(c) => setParams({ id: c.id })}
        emptyIcon={Contact}
        emptyMessage={search ? 'Ningún cliente coincide' : 'Aún no hay clientes'}
        emptyDescription={search ? undefined : 'Se registran al vender con correo o teléfono'}
      />
      {data && data.meta.totalPages > 1 && (
        <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
      )}
      {openId && <CustomerModal id={openId} onClose={() => setParams({})} />}
    </div>
  )
}

export default CustomersPage
