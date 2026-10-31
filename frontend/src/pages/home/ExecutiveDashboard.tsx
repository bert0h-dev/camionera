import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileDown } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast-context'
import { DailyNetChart } from '../reports/charts'
import { presetRange, useExecutiveReport } from '../reports/useReports'

type Period = 'today' | '7d' | 'month' | 'prev-month'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prev-month', label: 'Mes anterior' },
]

const pct = (v: number | null) => (v == null ? '—' : `${v} %`)

/** Cambio contra el periodo anterior; `goodUp` dice si subir es bueno. */
function Delta({ value, unit, goodUp = true }: { value: number | null; unit: '%' | 'pts'; goodUp?: boolean }) {
  if (value == null) return <span className="text-fg-subtle">sin comparación</span>
  const good = value === 0 ? null : value > 0 === goodUp
  return (
    <span
      className={cn(
        'font-data',
        good === true && 'text-emerald-600 dark:text-emerald-400',
        good === false && 'text-red-600 dark:text-red-400',
      )}
    >
      {value > 0 ? '▲ +' : value < 0 ? '▼ ' : ''}
      {value} {unit}
    </span>
  )
}

function Kpi({
  label,
  value,
  delta,
  hint,
  to,
}: {
  label: string
  value: ReactNode
  delta?: ReactNode
  hint?: ReactNode
  to: string
}) {
  return (
    <Link to={to} className="block rounded-xl bg-surface p-4 ring-1 ring-border transition hover:ring-border-strong">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 font-data text-2xl font-semibold text-fg">{value}</p>
      <p className="mt-1 text-xs text-fg-muted">
        {delta}
        {delta && hint && ' · '}
        {hint}
      </p>
    </Link>
  )
}

function FlagList({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {empty ? (
        <p className="text-sm text-fg-muted">Nada que revisar.</p>
      ) : (
        <ul className="space-y-1 text-sm">{children}</ul>
      )}
    </div>
  )
}

function FlagRow({ to, label, value }: { to: string; label: ReactNode; value: ReactNode }) {
  return (
    <li className="flex justify-between gap-3">
      <Link to={to} className="truncate hover:underline">
        {label}
      </Link>
      <span className="font-data text-red-600 dark:text-red-400">{value}</span>
    </li>
  )
}

/** Tablero ejecutivo: cifras clave contra el periodo anterior, neto por día y focos rojos. */
export function ExecutiveDashboard() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const range = presetRange(period)
  const { data, isLoading, error } = useExecutiveReport(range)
  const qs = `desde=${range.from}&hasta=${range.to}`
  const exportPdf = useMutation({
    mutationFn: async () => {
      const res = await api.get<Blob>('/reports/executive/export', {
        params: { format: 'pdf', ...range },
        responseType: 'blob',
      })
      const href = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = href
      a.download = `tablero-${range.from}-a-${range.to}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(href), 30_000)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const k = data?.kpis
  const f = data?.flags
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? 'primary' : 'secondary'}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={FileDown}
          loading={exportPdf.isPending}
          onClick={() => exportPdf.mutate()}
        >
          PDF
        </Button>
      </div>

      {error && <Alert tone="danger">{apiErrorMessage(error)}</Alert>}

      {isLoading || !k || !f || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-fg-muted">
            Del {data.range.from} al {data.range.to}, comparado con el {data.previous.from} al {data.previous.to}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Neto vendido"
              value={formatMoney(k.net)}
              delta={<Delta value={k.netChange} unit="%" />}
              to={`/reportes?${qs}`}
            />
            <Kpi
              label="Boletos"
              value={k.tickets.toLocaleString('es-MX')}
              delta={<Delta value={k.ticketsChange} unit="%" />}
              to={`/reportes?${qs}`}
            />
            <Kpi
              label="Ocupación"
              value={pct(k.occupancy)}
              delta={<Delta value={k.occupancyChange} unit="pts" />}
              hint={`${k.trips} recorridos`}
              to={`/reportes?vista=occupancy&${qs}`}
            />
            <Kpi
              label="Cancelación"
              value={pct(k.cancelRate)}
              delta={<Delta value={k.cancelRateChange} unit="pts" goodUp={false} />}
              to={`/reportes?vista=cancellations&${qs}`}
            />
            <Kpi
              label="No presentados"
              value={pct(k.noShowRate)}
              delta={<Delta value={k.noShowRateChange} unit="pts" goodUp={false} />}
              to={`/reportes?vista=cancellations&${qs}`}
            />
            <Kpi
              label="Km recorridos"
              value={k.km.toLocaleString('es-MX')}
              delta={<Delta value={k.kmChange} unit="%" />}
              to={`/reportes?vista=fleet&${qs}`}
            />
            <Kpi
              label="Costo por km"
              value={k.costPerKm == null ? '—' : formatMoney(k.costPerKm)}
              delta={<Delta value={k.costPerKmChange} unit="%" goodUp={false} />}
              to={`/reportes?vista=fleet&${qs}`}
            />
            <Kpi
              label="Salidas a tiempo"
              value={pct(k.onTimeRate)}
              hint={`asistencia ${pct(k.attendanceRate)}`}
              to={`/reportes?vista=staff&${qs}`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader title="Neto vendido por día" description="Pagos menos reembolsos, por su fecha" />
              <CardBody>
                <DailyNetChart data={data.days} />
              </CardBody>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Focos rojos" description="Lo que conviene revisar en el periodo" />
              <CardBody className="space-y-5">
                <FlagList
                  title={`Rutas con ocupación menor a ${data.thresholds.lowOccupancy} %`}
                  empty={!f.lowOccupancyRoutes.length}
                >
                  {f.lowOccupancyRoutes.map((r) => (
                    <FlagRow
                      key={r.routeId}
                      to={`/reportes?vista=occupancy&ruta=${r.routeId}&${qs}`}
                      label={`${r.code} · ${r.name}`}
                      value={pct(r.byKm)}
                    />
                  ))}
                </FlagList>
                <FlagList title="Unidades con rendimiento bajo" empty={!f.lowEfficiencyBuses.length}>
                  {f.lowEfficiencyBuses.map((b) => (
                    <FlagRow
                      key={b.busId}
                      to={`/flota/unidades/${b.busId}`}
                      label={`${b.number} · ${b.efficiency} km/L (esperado ${b.expected ?? '—'})`}
                      value={pct(b.gap)}
                    />
                  ))}
                </FlagList>
                <FlagList
                  title={`Horarios con ${data.thresholds.highNoShow} % o más de no presentados`}
                  empty={!f.noShowSchedules.length}
                >
                  {f.noShowSchedules.map((s) => (
                    <FlagRow
                      key={s.scheduleId}
                      to={`/reportes?vista=cancellations&${qs}`}
                      label={`${s.routeCode} ${s.departureTime} · ${s.sold} vendidos`}
                      value={pct(s.noShowRate)}
                    />
                  ))}
                </FlagList>
                <FlagList title="Diferencias de caja" empty={!f.cashDifferences.length}>
                  {f.cashDifferences.map((c) => (
                    <FlagRow
                      key={c.userId}
                      to={`/reportes?vista=staff&${qs}`}
                      label={`${c.name} · ${c.closes} corte(s)`}
                      value={formatMoney(c.difference)}
                    />
                  ))}
                </FlagList>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
