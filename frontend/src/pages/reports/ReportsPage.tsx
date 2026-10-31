import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ban, Bus, FileDown, FileSpreadsheet, Gauge, ReceiptText, Users } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../auth/useAuth'
import type { UserRole } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { CancellationReportTab, CancellationStats } from './CancellationReportTab'
import { FleetReportTab, FleetStats } from './FleetReportTab'
import { StaffReportTab, StaffStats } from './StaffReportTab'
import { OccupancyReportTab, OccupancyStats } from './OccupancyReportTab'
import { RangePicker } from './ReportFilters'
import { SalesReportTab, SalesStats } from './SalesReportTab'
import {
  presetRange,
  useCancellationReport,
  useFleetReport,
  useOccupancyReport,
  useSalesReport,
  useStaffReport,
  type SalesFilters,
} from './useReports'

type TabKey = 'sales' | 'occupancy' | 'cancellations' | 'fleet' | 'staff'

// Quién ve cada pestaña (admin, todas); el vendedor solo Ventas y RRHH solo Personal
const OPERATION: UserRole[] = ['admin', 'supervisor', 'coordinator']
const TABS: (TabItem<TabKey> & { roles: UserRole[] })[] = [
  { key: 'sales', label: 'Ventas', icon: ReceiptText, roles: [...OPERATION, 'vendor'] },
  { key: 'occupancy', label: 'Ocupación', icon: Gauge, roles: OPERATION },
  { key: 'cancellations', label: 'Cancelaciones', icon: Ban, roles: OPERATION },
  { key: 'fleet', label: 'Flota', icon: Bus, roles: OPERATION },
  { key: 'staff', label: 'Personal', icon: Users, roles: [...OPERATION, 'hr'] },
]

/** Exportación de cada pestaña. */
const EXPORTS: Record<TabKey, { url: string; name: string }> = {
  sales: { url: '/reports/sales/export', name: 'ventas' },
  occupancy: { url: '/reports/occupancy/export', name: 'ocupacion' },
  cancellations: { url: '/reports/cancellations/export', name: 'cancelaciones' },
  fleet: { url: '/reports/fleet/export', name: 'flota' },
  staff: { url: '/reports/staff/export', name: 'personal' },
}

/** Descarga un archivo del API (lleva el token, por eso no es un enlace directo). */
async function download(url: string, params: Record<string, string | undefined>, fallbackName: string) {
  const res = await api.get<Blob>(url, { params, responseType: 'blob' })
  const disposition = String(res.headers['content-disposition'] ?? '')
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}

/** Reportes: una pestaña por área, con periodo, filtros, gráficas y exportación a Excel y PDF. */
function ReportsPage() {
  const toast = useToast()
  const { user } = useAuth()
  const isVendor = user?.role === 'vendor'
  const [params, setParams] = useSearchParams()
  const month = presetRange('month')
  const f: SalesFilters = {
    from: params.get('desde') ?? month.from,
    to: params.get('hasta') ?? month.to,
    routeId: params.get('ruta') ?? '',
    sellerId: params.get('vendedor') ?? '',
    channel: params.get('canal') ?? '',
  }
  // El vendedor solo ve ventas; las pestañas de operación son de supervisión y coordinación
  const tabs = TABS.filter((t) => user && t.roles.includes(user.role))
  const requested = params.get('vista') as TabKey | null
  const tab: TabKey = tabs.some((t) => t.key === requested) ? requested! : (tabs[0]?.key ?? 'sales')
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const sales = useSalesReport(f, tab === 'sales')
  const occupancy = useOccupancyReport({ from: f.from, to: f.to, routeId: f.routeId }, tab === 'occupancy')
  const cancellations = useCancellationReport({ from: f.from, to: f.to, routeId: f.routeId }, tab === 'cancellations')
  const fleet = useFleetReport(f, tab === 'fleet')
  const staff = useStaffReport(f, tab === 'staff')
  const active = { sales, occupancy, cancellations, fleet, staff }[tab]
  const routes = useQuery({
    queryKey: ['trips', 'route-options'],
    queryFn: async () => (await api.get<{ id: string; code: string; name: string }[]>('/trips/route-options')).data,
  })
  const exportFile = useMutation({
    mutationFn: (format: 'xlsx' | 'pdf') =>
      download(
        EXPORTS[tab].url,
        {
          format,
          from: f.from,
          to: f.to,
          routeId: f.routeId || undefined,
          sellerId: tab === 'sales' ? f.sellerId || undefined : undefined,
          channel: tab === 'sales' ? f.channel || undefined : undefined,
        },
        `${EXPORTS[tab].name}.${format}`,
      ),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description={
          isVendor ? 'Tus ventas por periodo' : 'Ventas, ocupación, cancelaciones, flota y personal por periodo'
        }
        refreshing={active.isFetching && !active.isLoading}
        actions={
          <>
            <Button
              variant="glass"
              icon={FileSpreadsheet}
              loading={exportFile.isPending && exportFile.variables === 'xlsx'}
              onClick={() => exportFile.mutate('xlsx')}
            >
              Excel
            </Button>
            <Button
              variant="glass"
              icon={FileDown}
              loading={exportFile.isPending && exportFile.variables === 'pdf'}
              onClick={() => exportFile.mutate('pdf')}
            >
              PDF
            </Button>
          </>
        }
        stats={
          tab === 'sales' ? (
            <SalesStats data={sales.data} loading={sales.isLoading} />
          ) : tab === 'occupancy' ? (
            <OccupancyStats data={occupancy.data} loading={occupancy.isLoading} />
          ) : tab === 'cancellations' ? (
            <CancellationStats data={cancellations.data} loading={cancellations.isLoading} />
          ) : tab === 'fleet' ? (
            <FleetStats data={fleet.data} loading={fleet.isLoading} />
          ) : (
            <StaffStats data={staff.data} loading={staff.isLoading} />
          )
        }
        bottom={
          tabs.length > 1 && (
            <Tabs
              variant="band"
              items={tabs}
              value={tab}
              onChange={(k) => set({ vista: k === tabs[0]?.key ? '' : k })}
            />
          )
        }
      />

      <FilterBar>
        <RangePicker from={f.from} to={f.to} onChange={(r) => set({ desde: r.from, hasta: r.to })} />
        {tab !== 'fleet' && tab !== 'staff' && (
          <div className="w-full sm:w-56">
            <Select aria-label="Ruta" value={f.routeId} onChange={(e) => set({ ruta: e.target.value })}>
              <option value="">Todas las rutas</option>
              {routes.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {!isVendor && tab === 'sales' && (
          <div className="w-full sm:w-48">
            <Select aria-label="Vendedor" value={f.sellerId} onChange={(e) => set({ vendedor: e.target.value })}>
              <option value="">Todos los vendedores</option>
              {sales.data?.bySeller
                .filter((s) => s.sellerId)
                .map((s) => (
                  <option key={s.sellerId} value={s.sellerId!}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </div>
        )}
      </FilterBar>

      {tab === 'sales' && <SalesReportTab query={sales} />}
      {tab === 'occupancy' && <OccupancyReportTab query={occupancy} />}
      {tab === 'cancellations' && <CancellationReportTab query={cancellations} />}
      {tab === 'fleet' && <FleetReportTab query={fleet} />}
      {tab === 'staff' && <StaffReportTab query={staff} />}
    </div>
  )
}

export default ReportsPage
