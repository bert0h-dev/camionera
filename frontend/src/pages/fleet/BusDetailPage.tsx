import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, FileText, Gauge, History, Info, Pencil, Plus, RefreshCw } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { daysLabel, formatDate } from '../../lib/format'
import {
  BUS_DOCUMENT_LABELS,
  BUS_STATUS_LABELS,
  BUS_TYPE_LABELS,
  type BusDetail,
  type BusDocument,
  type BusHistory,
  type BusSeat,
  type BusStatus,
} from '../../lib/types'
import { DocumentStatusBadge } from '../../components/DocumentStatusBadge'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { DocumentModal, OdometerModal, SeatModal, StatusModal } from './BusModals'
import { BusSeatMap } from './BusSeatMap'
import { BusStatusBadge, FitBadge } from './BusStatusBadge'
import { useCanEditFleet } from './useFleet'

type TabKey = 'general' | 'seats' | 'documents' | 'history'

const formatKm = (km: number) => `${km.toLocaleString('es-MX')} km`

function BusDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canEdit = useCanEditFleet()
  const [tab, setTab] = useState<TabKey>('general')
  const [statusOpen, setStatusOpen] = useState(false)
  const [odometerOpen, setOdometerOpen] = useState(false)
  const [seat, setSeat] = useState<BusSeat | null>(null)
  const [docEdit, setDocEdit] = useState<BusDocument | null | undefined>(undefined) // undefined = cerrado
  const [docDelete, setDocDelete] = useState<BusDocument | null>(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const {
    data: bus,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['fleet', 'buses', id],
    queryFn: async () => (await api.get<BusDetail>(`/fleet/buses/${id}`)).data,
  })
  const history = useQuery({
    queryKey: ['fleet', 'bus-history', id],
    queryFn: async () => (await api.get<BusHistory>(`/fleet/buses/${id}/history`)).data,
    enabled: tab === 'history',
  })

  const removeDoc = useMutation({
    mutationFn: (doc: BusDocument) => api.delete(`/fleet/buses/${id}/documents/${doc.id}`),
    onSuccess: () => {
      toast.success('Documento eliminado')
      queryClient.invalidateQueries({ queryKey: ['fleet', 'buses'] })
      setDocDelete(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (error) return <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar la unidad')}</Alert>
  if (!bus) return <LoadingBlock text="Cargando unidad…" />

  const blocked = bus.seats.filter((s) => s.isBlocked).length
  // Solo el documento más reciente de cada tipo cuenta para las alertas
  const latestDocs = bus.documents.filter((d, i, all) => all.findIndex((x) => x.type === d.type) === i)
  const docAlerts = latestDocs.filter((d) => d.status !== 'valid').length

  const tabs: TabItem<TabKey>[] = [
    { key: 'general', label: 'General', icon: Info },
    { key: 'seats', label: 'Asientos', icon: Armchair, badge: blocked || undefined },
    { key: 'documents', label: 'Documentos', icon: FileText, badge: docAlerts || undefined },
    { key: 'history', label: 'Historial', icon: History },
  ]

  const docColumns: Column<BusDocument>[] = [
    { header: 'Documento', cell: (d) => <span className="font-medium">{BUS_DOCUMENT_LABELS[d.type]}</span> },
    { header: 'Folio', cell: (d) => <span className="font-data">{d.folio}</span> },
    { header: 'Emisor', cell: (d) => d.issuer ?? <span className="text-fg-subtle">—</span> },
    { header: 'Expedición', cell: (d) => formatDate(d.issueDate) },
    {
      header: 'Vencimiento',
      cell: (d) =>
        d.expiryDate ? (
          <div>
            <div>{formatDate(d.expiryDate)}</div>
            <div className="text-xs text-fg-muted">{daysLabel(d.daysToExpiry)}</div>
          </div>
        ) : (
          <span className="text-fg-subtle">No vence</span>
        ),
    },
    {
      header: 'Estado',
      cell: (d) =>
        latestDocs.includes(d) ? (
          <DocumentStatusBadge status={d.status} />
        ) : (
          <span className="text-xs text-fg-subtle">Anterior</span>
        ),
    },
    {
      header: '',
      cell: (d) =>
        canEdit && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDocEdit(d)}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDocDelete(d)}>
              Eliminar
            </Button>
          </div>
        ),
    },
  ]

  const facts: [string, React.ReactNode][] = [
    [
      'Número económico',
      <span key="en" className="font-data">
        {bus.economicNumber}
      </span>,
    ],
    [
      'Placas',
      <span key="pl" className="font-data">
        {bus.plates}
      </span>,
    ],
    [
      'VIN',
      <span key="vin" className="font-data">
        {bus.vin}
      </span>,
    ],
    ['Año', bus.year],
    [
      'Modelo',
      <Link key="model" className="text-primary hover:underline" to={`/flota/modelos/${bus.busModelId}`}>
        {bus.busModel.brand} {bus.busModel.model} · {BUS_TYPE_LABELS[bus.busModel.busType]}
      </Link>,
    ],
    ['Combustible', bus.busModel.fuelType.name],
    ['Terminal base', `${bus.terminal.code} · ${bus.terminal.name} (${bus.terminal.city.name})`],
    ['En servicio desde', bus.firstServiceAt ? formatDate(bus.firstServiceAt) : 'Aún no sale a servicio'],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Unidad ${bus.economicNumber}`}
        description={`${bus.busModel.brand} ${bus.busModel.model} · ${bus.plates}`}
        refreshing={isFetching}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <BusStatusBadge status={bus.status} />
            <FitBadge fit={bus.fit} reasons={bus.reasons} />
          </div>
        }
        actions={
          canEdit && (
            <>
              <Button variant="glass" icon={Gauge} onClick={() => setOdometerOpen(true)}>
                Odómetro
              </Button>
              <Button variant="glass" icon={RefreshCw} onClick={() => setStatusOpen(true)}>
                Cambiar estado
              </Button>
              <Button variant="accent" icon={Pencil} onClick={() => navigate(`/flota/unidades/${bus.id}/editar`)}>
                Editar
              </Button>
            </>
          )
        }
        stats={
          <>
            <HeroStat label="Odómetro" value={formatKm(bus.odometerKm)} tone="primary" hint="última lectura" />
            <HeroStat
              label="Asientos disponibles"
              value={bus.seats.length - blocked}
              hint={blocked ? `${blocked} bloqueado(s) de ${bus.seats.length}` : `de ${bus.seats.length}`}
              tone={blocked ? 'warning' : 'neutral'}
            />
            <HeroStat
              label="Documentos"
              value={docAlerts ? `${docAlerts} con alerta` : 'En orden'}
              tone={latestDocs.some((d) => d.status === 'expired') ? 'danger' : docAlerts ? 'warning' : 'success'}
              hint={`${latestDocs.length} tipo(s) registrados`}
            />
            <HeroStat
              label="Preventivo cada"
              value={bus.preventive.km ? formatKm(bus.preventive.km) : '—'}
              hint={`${bus.preventive.days ? `o ${bus.preventive.days} días · ` : ''}${bus.preventive.fromModel ? 'plan del modelo' : 'plan propio'}`}
            />
          </>
        }
        bottom={<Tabs variant="band" items={tabs} value={tab} onChange={setTab} />}
      />

      {!bus.fit && (
        <Alert tone={bus.status === 'out_of_service' ? 'neutral' : 'danger'} title="La unidad no puede salir">
          <ul className="list-disc pl-5">
            {bus.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Alert>
      )}

      {tab === 'general' && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader title="Datos de la unidad" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-fg-muted">{label}</dt>
                    <dd className="mt-0.5 text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
              {bus.notes && <p className="mt-4 rounded-md bg-surface-sunken p-3 text-sm">{bus.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Estado" />
            <CardBody className="space-y-2 text-sm">
              <BusStatusBadge status={bus.status} />
              <div className="text-fg-muted">Desde {formatDate(bus.statusChangedAt)}</div>
              {bus.statusReason && <p className="rounded-md bg-surface-sunken p-3">{bus.statusReason}</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'seats' && (
        <Card>
          <CardHeader
            title="Asientos"
            description={canEdit ? 'Haz clic en un asiento para bloquearlo o desbloquearlo' : undefined}
          />
          <CardBody>
            <BusSeatMap layout={bus.busModel.layout} seats={bus.seats} onSeatClick={canEdit ? setSeat : undefined} />
            {blocked > 0 && (
              <ul className="mt-6 divide-y divide-border rounded-md border border-border text-sm">
                {bus.seats
                  .filter((s) => s.isBlocked)
                  .map((s) => (
                    <li key={s.id} className="flex justify-between gap-3 px-3 py-2">
                      <span>
                        <span className="font-data font-semibold">{s.number}</span> · {s.blockReason}
                      </span>
                      <span className="text-xs text-fg-muted">{s.blockedAt && formatDate(s.blockedAt)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'documents' && (
        <div className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <Button icon={Plus} onClick={() => setDocEdit(null)}>
                Nuevo documento
              </Button>
            </div>
          )}
          <Table
            columns={docColumns}
            rows={bus.documents}
            rowKey={(d) => d.id}
            emptyIcon={FileText}
            emptyMessage="Sin documentos"
            emptyDescription="Registra al menos el seguro y la tarjeta de circulación para que la unidad sea apta"
          />
        </div>
      )}

      {tab === 'history' &&
        (history.isLoading ? (
          <LoadingBlock text="Cargando historial…" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Lecturas del odómetro" />
              <ul className="divide-y divide-border text-sm">
                {history.data?.readings.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 px-5 py-2.5">
                    <span className="font-data font-semibold">{formatKm(r.km)}</span>
                    <span className="text-right text-xs text-fg-muted">
                      {formatDate(r.recordedAt)}
                      {r.recordedByName && ` · ${r.recordedByName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Cambios de estado" />
              {!history.data?.changes.some((c) => c.newValues && 'status' in c.newValues) && (
                <p className="px-5 py-4 text-sm text-fg-muted">Sin cambios de estado desde el alta.</p>
              )}
              <ul className="divide-y divide-border text-sm">
                {history.data?.changes
                  .filter((c) => c.newValues && 'status' in c.newValues)
                  .map((c) => (
                    <li key={c.id} className="px-5 py-2.5">
                      <div className="flex justify-between gap-3">
                        <span>
                          {c.oldValues?.status ? `${BUS_STATUS_LABELS[c.oldValues.status as BusStatus]} → ` : ''}
                          <strong>{BUS_STATUS_LABELS[c.newValues!.status as BusStatus]}</strong>
                        </span>
                        <span className="text-xs text-fg-muted">
                          {formatDate(c.createdAt)}
                          {c.user && ` · ${c.user}`}
                        </span>
                      </div>
                      {typeof c.newValues?.statusReason === 'string' && (
                        <div className="text-xs text-fg-muted">{c.newValues.statusReason}</div>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        ))}

      {canEdit && (
        <>
          <StatusModal key={`s-${bus.status}`} bus={bus} open={statusOpen} onClose={() => setStatusOpen(false)} />
          <OdometerModal
            key={`o-${bus.odometerKm}`}
            bus={bus}
            open={odometerOpen}
            onClose={() => setOdometerOpen(false)}
          />
          <SeatModal busId={bus.id} seat={seat} onClose={() => setSeat(null)} />
          {docEdit !== undefined && (
            <DocumentModal
              key={docEdit?.id ?? 'new'}
              busId={bus.id}
              doc={docEdit}
              open
              onClose={() => setDocEdit(undefined)}
            />
          )}
          <ConfirmModal
            open={!!docDelete}
            title="Eliminar documento"
            message={docDelete ? `¿Eliminar ${BUS_DOCUMENT_LABELS[docDelete.type]} ${docDelete.folio}?` : ''}
            confirmLabel="Eliminar"
            loading={removeDoc.isPending}
            onConfirm={() => docDelete && removeDoc.mutate(docDelete)}
            onClose={() => setDocDelete(null)}
          />
        </>
      )}
    </div>
  )
}

export default BusDetailPage
