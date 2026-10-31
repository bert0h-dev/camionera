import { Users } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import type { StaffReport } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import type { useStaffReport } from './useReports'

const pct = (v: number | null) => (v == null ? '—' : `${v} %`)

export function StaffStats({ data, loading }: { data?: StaffReport; loading: boolean }) {
  const k = data?.summary
  return (
    <>
      <HeroStat
        label="Salidas a tiempo"
        value={pct(k?.onTimeRate ?? null)}
        tone="primary"
        loading={loading}
        hint={k ? `${k.late} tarde · retraso promedio ${k.avgDelay ?? 0} min` : undefined}
      />
      <HeroStat
        label="Horas de manejo"
        value={(k?.drivingHours ?? 0).toLocaleString('es-MX')}
        loading={loading}
        hint={k ? `${k.trips} recorridos · ${k.drivers} conductores` : undefined}
      />
      <HeroStat
        label="Asistencia"
        value={pct(k?.attendanceRate ?? null)}
        tone={k && k.absences ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `${k.absences} falta(s) · ${k.lateArrivals} retardo(s)` : undefined}
      />
      <HeroStat
        label="Diferencias de caja"
        value={formatMoney(k?.cashDifference ?? 0)}
        tone={k?.cashDifference ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `vendido neto ${formatMoney(k.sales)}` : undefined}
      />
    </>
  )
}

export function StaffReportTab({ query }: { query: ReturnType<typeof useStaffReport> }) {
  const { data, isLoading, error } = query
  if (isLoading) return <LoadingBlock text="Calculando personal…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  if (!data.drivers.length && !data.sellers.length && !data.attendance.length)
    return <EmptyState icon={Users} title="Sin actividad del personal en el periodo" />

  const driverCols: Column<StaffReport['drivers'][number]>[] = [
    { header: 'Conductor', cell: (d) => <span className="font-medium">{d.name}</span> },
    { header: 'Recorridos', cell: (d) => <span className="font-data">{d.trips}</span> },
    { header: 'Horas', cell: (d) => <span className="font-data">{d.hours}</span> },
    { header: 'Km', cell: (d) => <span className="font-data">{d.km.toLocaleString('es-MX')}</span> },
    {
      header: 'A tiempo',
      cell: (d) => (
        <Badge tone={d.onTimeRate != null && d.onTimeRate < 80 ? 'warning' : 'success'}>{pct(d.onTimeRate)}</Badge>
      ),
    },
    {
      header: 'Retraso prom.',
      cell: (d) => <span className="font-data">{d.late ? `${d.avgDelay} min (${d.late})` : '—'}</span>,
    },
    { header: 'Incidencias', cell: (d) => <span className="font-data">{d.incidents}</span> },
  ]
  const sellerCols: Column<StaffReport['sellers'][number]>[] = [
    { header: 'Vendedor', cell: (s) => <span className="font-medium">{s.name}</span> },
    { header: 'Compras', cell: (s) => <span className="font-data">{s.orders}</span> },
    { header: 'Boletos', cell: (s) => <span className="font-data">{s.tickets}</span> },
    { header: 'Neto', cell: (s) => <span className="font-data font-semibold">{formatMoney(s.net)}</span> },
    {
      header: `Comisión (${data.vendorPercent} %)`,
      cell: (s) => <span className="font-data">{formatMoney(s.commission)}</span>,
    },
    { header: 'Cancelaciones', cell: (s) => <span className="font-data">{s.cancellations}</span> },
    {
      header: 'Caja',
      cell: (s) => (
        <span className="font-data text-sm">
          {s.cashCloses} corte(s)
          {s.closesWithDifference > 0 && (
            <span className="block text-xs text-amber-700 dark:text-amber-400">
              {s.closesWithDifference} con diferencia · {formatMoney(s.cashDifference)}
            </span>
          )}
        </span>
      ),
    },
  ]
  const attendanceCols: Column<StaffReport['attendance'][number]>[] = [
    { header: 'Empleado', cell: (a) => <span className="font-medium">{a.name}</span> },
    { header: 'Asistencias', cell: (a) => <span className="font-data">{a.present}</span> },
    { header: 'Retardos', cell: (a) => <span className="font-data">{a.late}</span> },
    { header: 'Faltas', cell: (a) => <span className="font-data">{a.absent}</span> },
    { header: 'Justificadas', cell: (a) => <span className="font-data">{a.excused}</span> },
    { header: 'Horas extra', cell: (a) => <span className="font-data">{a.overtimeHours}</span> },
    {
      header: '% asistencia',
      cell: (a) => <Badge tone={a.rate != null && a.rate < 90 ? 'warning' : 'success'}>{pct(a.rate)}</Badge>,
    },
  ]

  return (
    <div className="space-y-6">
      <Alert tone="info">
        A tiempo = menos de {data.onTimeMinutes} min de retraso en la salida real contra la programada. La asistencia no
        cuenta los días justificados y el medio día vale la mitad.
      </Alert>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Conductores</h2>
        <Table columns={driverCols} rows={data.drivers} rowKey={(d) => d.staffId} />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Vendedores</h2>
        <Table columns={sellerCols} rows={data.sellers} rowKey={(s) => s.userId} />
      </div>
      {data.collectors.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Cobradores</h2>
          <Table
            columns={[
              { header: 'Cobrador', cell: (c) => <span className="font-medium">{c.name}</span> },
              { header: 'Recorridos', cell: (c) => <span className="font-data">{c.trips}</span> },
              { header: 'Abordajes', cell: (c) => <span className="font-data">{c.boarded}</span> },
            ]}
            rows={data.collectors}
            rowKey={(c) => c.staffId}
          />
        </div>
      )}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Asistencia</h2>
        <Table
          columns={attendanceCols}
          rows={data.attendance}
          rowKey={(a) => a.staffId}
          emptyIcon={Users}
          emptyMessage="Sin registros de asistencia en el periodo"
        />
      </div>
    </div>
  )
}
