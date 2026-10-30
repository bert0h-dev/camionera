import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet, ReceiptText } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { RangePicker } from './ReportFilters'
import { SalesReportTab, SalesStats } from './SalesReportTab'
import { presetRange, useSalesReport, type SalesFilters } from './useReports'

type TabKey = 'sales'

const TABS: TabItem<TabKey>[] = [{ key: 'sales', label: 'Ventas', icon: ReceiptText }]

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
  const [params, setParams] = useSearchParams()
  const month = presetRange('month')
  const f: SalesFilters = {
    from: params.get('desde') ?? month.from,
    to: params.get('hasta') ?? month.to,
    routeId: params.get('ruta') ?? '',
    sellerId: params.get('vendedor') ?? '',
    channel: params.get('canal') ?? '',
  }
  const tab: TabKey = 'sales'
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const sales = useSalesReport(f)
  const routes = useQuery({
    queryKey: ['trips', 'route-options'],
    queryFn: async () => (await api.get<{ id: string; code: string; name: string }[]>('/trips/route-options')).data,
  })
  const exportFile = useMutation({
    mutationFn: (format: 'xlsx' | 'pdf') =>
      download(
        '/reports/sales/export',
        {
          format,
          from: f.from,
          to: f.to,
          routeId: f.routeId || undefined,
          sellerId: f.sellerId || undefined,
          channel: f.channel || undefined,
        },
        `ventas.${format}`,
      ),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const isVendor = user?.role === 'vendor'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description={
          isVendor ? 'Tus ventas por periodo' : 'Ventas, ocupación, cancelaciones, flota y personal por periodo'
        }
        refreshing={sales.isFetching && !sales.isLoading}
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
        stats={tab === 'sales' && <SalesStats data={sales.data} loading={sales.isLoading} />}
        bottom={<Tabs variant="band" items={TABS} value={tab} onChange={() => undefined} />}
      />

      <FilterBar>
        <RangePicker from={f.from} to={f.to} onChange={(r) => set({ desde: r.from, hasta: r.to })} />
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
        {!isVendor && (
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
    </div>
  )
}

export default ReportsPage
