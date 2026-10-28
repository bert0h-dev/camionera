import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, Tags } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { IncidentCategory } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { IncidentsTable } from './IncidentsTable'
import { ReportIncidentModal, type ReportPreset } from './ReportIncidentModal'
import { useIncidentCategories, useIncidentRole, useIncidentSummary } from './useFleet'

type TabKey = 'incidents' | 'categories'

function CategoriesTab({ canManage }: { canManage: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [isAccident, setIsAccident] = useState(false)
  const { data, isLoading } = useIncidentCategories(true)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fleet', 'incidents', 'categories'] })
  const add = useMutation({
    mutationFn: () => api.post('/fleet/incidents/categories', { name, isAccident }),
    onSuccess: () => {
      setName('')
      setIsAccident(false)
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<IncidentCategory> & { id: string }) =>
      api.patch(`/fleet/incidents/categories/${id}`, body),
    onSuccess: invalidate,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const columns: Column<IncidentCategory>[] = [
    { header: '#', cell: (c) => <span className="font-data text-fg-muted">{c.sortOrder}</span> },
    { header: 'Categoría', cell: (c) => <span className={c.isActive ? '' : 'line-through'}>{c.name}</span> },
    {
      header: 'Siniestro',
      cell: (c) =>
        canManage ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={c.isAccident}
              onChange={() => update.mutate({ id: c.id, isAccident: !c.isAccident })}
            />
            Es accidente
          </label>
        ) : c.isAccident ? (
          <Badge tone="orange">Accidente</Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      header: 'Estado',
      cell: (c) => (
        <Badge tone={c.isActive ? 'success' : 'neutral'} dot>
          {c.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (c) =>
        canManage && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: c.id, isActive: !c.isActive })}>
              {c.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Las categorías marcadas como accidente piden el número de siniestro, la aseguradora y si hubo terceros o
        lesionados. Las inactivas ya no aparecen al reportar, pero se conservan en el historial.
      </p>
      {canManage && (
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <div className="min-w-60 flex-1">
            <Input placeholder="Nueva categoría…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={isAccident}
              onChange={(e) => setIsAccident(e.target.checked)}
            />
            Es accidente
          </label>
          <Button type="submit" icon={Plus} loading={add.isPending} disabled={name.trim().length < 2}>
            Agregar
          </Button>
        </form>
      )}
      <Table
        columns={columns}
        rows={data ?? []}
        rowKey={(c) => c.id}
        loading={isLoading}
        rowClassName={(c) => !c.isActive && 'opacity-60'}
        emptyIcon={Tags}
        emptyMessage="Sin categorías"
      />
    </div>
  )
}

function IncidentsPage() {
  const { canManage, isReporterOnly } = useIncidentRole()
  const [tab, setTab] = useState<TabKey>('incidents')
  const [chosen, setChosen] = useState<ReportPreset | null>(null)
  const [params, setParams] = useSearchParams()
  // La acción rápida de Ctrl+K abre el reporte con ?nueva=1
  const preset = chosen ?? (params.get('nueva') === '1' ? {} : null)
  const setPreset = (p: ReportPreset | null) => {
    setChosen(p)
    if (!p && params.has('nueva')) setParams({}, { replace: true })
  }
  const summary = useIncidentSummary()
  const s = summary.data

  const tabs: TabItem<TabKey>[] = [
    {
      key: 'incidents',
      label: isReporterOnly ? 'Mis reportes' : 'Incidencias',
      icon: AlertTriangle,
      badge: s?.open || undefined,
    },
    ...(isReporterOnly ? [] : [{ key: 'categories' as const, label: 'Categorías', icon: Tags }]),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={isReporterOnly ? 'Mis incidencias' : 'Incidencias'}
        description={
          isReporterOnly
            ? 'Reporta fallas, daños o accidentes de una unidad y sigue su atención'
            : 'Fallas, daños y accidentes reportados por unidad; se atienden con una orden correctiva'
        }
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setPreset({})}>
            Reportar incidencia
          </Button>
        }
        stats={
          <>
            <HeroStat
              label="Abiertas"
              value={s?.open ?? 0}
              tone={s?.open ? 'warning' : 'neutral'}
              loading={summary.isLoading}
              hint={`${s?.reported ?? 0} sin revisar`}
            />
            <HeroStat
              label="Críticas"
              value={s?.critical ?? 0}
              tone={s?.critical ? 'danger' : 'neutral'}
              loading={summary.isLoading}
              hint="abiertas, unidad detenida"
            />
            <HeroStat
              label="En revisión"
              value={s?.inReview ?? 0}
              tone="primary"
              loading={summary.isLoading}
              hint="alguien las atiende"
            />
            <HeroStat
              label="Resueltas del mes"
              value={s?.resolvedThisMonth ?? 0}
              tone={s?.resolvedThisMonth ? 'success' : 'neutral'}
              loading={summary.isLoading}
              hint={isReporterOnly ? 'de tus reportes' : 'cerradas este mes'}
            />
          </>
        }
        bottom={tabs.length > 1 && <Tabs variant="band" items={tabs} value={tab} onChange={setTab} />}
      />

      {tab === 'incidents' && <IncidentsTable />}
      {tab === 'categories' && <CategoriesTab canManage={canManage} />}

      <ReportIncidentModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}

export default IncidentsPage
