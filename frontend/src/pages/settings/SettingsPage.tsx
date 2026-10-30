import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Percent, SlidersHorizontal } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import type { SettingItem, SettingValue } from '../../lib/types'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { SettingsForm } from './SettingsForm'
import { LogoCard } from './LogoCard'
import { ParametersTab } from './ParametersTab'
import { useAuth } from '../../auth/useAuth'

type TabKey = 'company' | 'taxes' | 'params'

const TABS: TabItem<TabKey>[] = [
  { key: 'company', label: 'Empresa', icon: Building2 },
  { key: 'taxes', label: 'Impuestos y comisiones', icon: Percent },
  { key: 'params', label: 'Parámetros', icon: SlidersHorizontal },
]

const SAMPLE_FARE = 500

/** Ejemplo con un boleto de $500 para ver el efecto del IVA y las comisiones antes de guardar. */
function TaxPreview({ values }: { values: Record<string, SettingValue> }) {
  const rate = Number(values['taxes.vat_rate']) / 100
  const included = values['taxes.prices_include_vat'] as boolean
  const base = included ? SAMPLE_FARE / (1 + rate) : SAMPLE_FARE
  const vat = base * rate
  const total = base + vat
  const vendor = (total * Number(values['commissions.vendor_percent'])) / 100
  const online = (total * Number(values['commissions.online_percent'])) / 100
  const rows = [
    ['Importe sin IVA', formatMoney(base)],
    [`IVA ${values['taxes.vat_rate']} %`, formatMoney(vat)],
    ['Precio al pasajero en taquilla', formatMoney(total)],
    ['Comisión del vendedor', formatMoney(vendor)],
    ['Precio comprando en línea', formatMoney(total + online)],
  ]
  return (
    <div className="rounded-xl bg-band p-4 text-white">
      <div className="text-xs text-indigo-200">
        Ejemplo: tarifa de {formatMoney(SAMPLE_FARE)} {included ? '(IVA incluido)' : '(más IVA)'}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-indigo-200">{label}</dt>
            <dd className="font-data font-semibold text-amber-400">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // RRHH solo administra los parámetros de personal y nómina
  const [tab, setTab] = useState<TabKey>(isAdmin ? 'company' : 'params')
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<SettingItem[]>('/settings')).data,
  })
  const all = data ?? []
  const of = (group: string) => all.filter((s) => s.group === group)
  const value = (key: string) => all.find((s) => s.key === key)?.value
  const company = of('company')
  const filled = company.filter((s) => s.value !== '').length
  const tabs = TABS.filter((t) => isAdmin || t.key === 'params')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description={
          isAdmin
            ? 'Datos de la empresa, impuestos y parámetros que rigen la operación'
            : 'Parámetros de personal y nómina que rigen la operación'
        }
        refreshing={isFetching && !isLoading}
        stats={
          isAdmin && (
            <>
              <HeroStat
                label="Empresa"
                value={(value('company.trade_name') as string) || '—'}
                hint={`${filled} de ${company.length} datos capturados`}
                tone={company.length && filled < company.length ? 'warning' : 'neutral'}
                loading={isLoading}
              />
              <HeroStat
                label="IVA"
                value={`${value('taxes.vat_rate') ?? '—'} %`}
                hint={value('taxes.prices_include_vat') ? 'incluido en las tarifas' : 'se suma a las tarifas'}
                tone="primary"
                loading={isLoading}
              />
              <HeroStat
                label="Comisión en taquilla"
                value={`${value('commissions.vendor_percent') ?? '—'} %`}
                hint="para el vendedor por boleto"
                loading={isLoading}
              />
              <HeroStat
                label="Cargo en línea"
                value={`${value('commissions.online_percent') ?? '—'} %`}
                hint="se suma al comprar en línea"
                loading={isLoading}
              />
            </>
          )
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} className="border-b border-border" />

      {isLoading ? (
        <LoadingBlock text="Cargando configuración…" />
      ) : tab === 'params' ? (
        <ParametersTab settings={all} />
      ) : tab === 'company' ? (
        <div className="space-y-6">
          <SettingsForm
            key={`company-${data?.length}-${company.map((s) => s.updatedAt).join()}`}
            title="Datos de la empresa"
            description="Aparecen en los boletos, recibos y reportes."
            items={company}
            wide={['company.legal_name', 'company.address']}
          />
          <LogoCard />
        </div>
      ) : (
        <SettingsForm
          key={`taxes-${[...of('taxes'), ...of('commissions')].map((s) => s.updatedAt).join()}`}
          title="Impuestos y comisiones"
          description="Se aplican en la venta de boletos. Revisa el ejemplo antes de guardar."
          items={[...of('taxes'), ...of('commissions')]}
          preview={(values) => <TaxPreview values={values} />}
        />
      )}
    </div>
  )
}

export default SettingsPage
