import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { BUS_TYPE_LABELS, BUS_TYPES, type BusLayout, type BusModel, type BusType } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { LayoutEditor } from './LayoutEditor'
import { layoutProblems, renumber, seatCount } from './layout'
import { useCanEditFleet, useFuelTypes } from './useFleet'

interface Draft {
  brand: string
  model: string
  busType: BusType
  fuelTypeId: string
  tankCapacity: string
  expectedEfficiency: string
  preventiveKm: string
  preventiveDays: string
  features: string
  specifications: string
  isActive: boolean
  layout: BusLayout
}

const toDraft = (m: BusModel): Draft => ({
  brand: m.brand,
  model: m.model,
  busType: m.busType,
  fuelTypeId: m.fuelTypeId,
  tankCapacity: m.tankCapacity ? String(Number(m.tankCapacity)) : '',
  expectedEfficiency: m.expectedEfficiency ? String(Number(m.expectedEfficiency)) : '',
  preventiveKm: m.preventiveKm ? String(m.preventiveKm) : '',
  preventiveDays: m.preventiveDays ? String(m.preventiveDays) : '',
  features: m.features.join(', '),
  specifications: m.specifications ?? '',
  isActive: m.isActive,
  layout: m.layout,
})

const num = (v: string) => (v.trim() === '' ? null : Number(v))

function BusModelFormPage() {
  const { id } = useParams()
  const isNew = !id

  const model = useQuery({
    queryKey: ['fleet', 'bus-models', id],
    queryFn: async () => (await api.get<BusModel>(`/fleet/bus-models/${id}`)).data,
    enabled: !isNew,
  })
  // Un modelo nuevo arranca con la distribución típica 2 + pasillo + 2
  const starter = useQuery({
    queryKey: ['fleet', 'default-layout'],
    queryFn: async () => (await api.get<BusLayout>('/fleet/bus-models/default-layout')).data,
    enabled: isNew,
    staleTime: Infinity,
  })

  if (model.error) return <Alert tone="danger">{apiErrorMessage(model.error, 'No se pudo cargar el modelo')}</Alert>
  if (isNew ? !starter.data : !model.data) return <LoadingBlock text="Cargando modelo…" />

  const initial: Draft = model.data
    ? toDraft(model.data)
    : {
        brand: '',
        model: '',
        busType: 'standard',
        fuelTypeId: '',
        tankCapacity: '',
        expectedEfficiency: '',
        preventiveKm: '15000',
        preventiveDays: '90',
        features: '',
        specifications: '',
        isActive: true,
        layout: starter.data!,
      }
  return <BusModelForm key={id ?? 'nuevo'} id={id} initial={initial} />
}

function BusModelForm({ id, initial }: { id?: string; initial: Draft }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canEdit = useCanEditFleet()
  const fuels = useFuelTypes()
  const [draft, setDraft] = useState(initial)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const maxFloors = draft.busType === 'double_decker' ? 2 : 1
  const problems = layoutProblems(draft.layout)
  const allSeats = draft.layout.floors.flatMap((f) => f.cells).filter((c) => c.type === 'seat')
  const special = allSeats.filter((c) => c.category && c.category !== 'normal').length

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        brand: draft.brand,
        model: draft.model,
        busType: draft.busType,
        fuelTypeId: draft.fuelTypeId,
        tankCapacity: num(draft.tankCapacity),
        expectedEfficiency: num(draft.expectedEfficiency),
        preventiveKm: num(draft.preventiveKm),
        preventiveDays: num(draft.preventiveDays),
        features: draft.features
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
        specifications: draft.specifications,
        layout: draft.layout,
        ...(id && { isActive: draft.isActive }),
      }
      return id
        ? (await api.patch<BusModel>(`/fleet/bus-models/${id}`, body)).data
        : (await api.post<BusModel>('/fleet/bus-models', body)).data
    },
    onSuccess: (saved) => {
      toast.success('Modelo guardado')
      setServerErrors([])
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      navigate(`/flota/modelos/${saved.id}`, { replace: true })
    },
    onError: (err) => {
      const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
      setServerErrors(Array.isArray(data?.message) ? data.message.map(String) : [])
      toast.error(apiErrorMessage(err))
    },
  })

  const ready = draft.brand.trim().length >= 2 && draft.model.trim() && draft.fuelTypeId && problems.length === 0
  const fuelUnit = fuels.data?.find((f) => f.id === draft.fuelTypeId)?.unit ?? 'L'
  const title = id ? `${initial.brand} ${initial.model}` : 'Nuevo modelo'

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <PageHeader
        title={title}
        description={canEdit ? 'Datos técnicos y distribución de asientos' : 'Consulta del modelo y su distribución'}
        meta={
          id && (
            <Badge tone={draft.isActive ? 'success' : 'neutral'} dot>
              {draft.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          )
        }
        actions={
          canEdit && (
            <>
              <Button variant="glass" icon={X} onClick={() => navigate('/flota/modelos')}>
                Cancelar
              </Button>
              <Button variant="accent" type="submit" icon={Save} loading={save.isPending} disabled={!ready}>
                Guardar
              </Button>
            </>
          )
        }
        stats={
          <>
            <HeroStat label="Asientos" value={seatCount(draft.layout)} tone="primary" hint="capacidad del modelo" />
            <HeroStat label="Preferentes y accesibles" value={special} hint={`${allSeats.length - special} normales`} />
            <HeroStat label="Pisos" value={draft.layout.floors.length} hint={BUS_TYPE_LABELS[draft.busType]} />
            <HeroStat
              label="Rendimiento esperado"
              value={draft.expectedEfficiency ? `${draft.expectedEfficiency} km/${fuelUnit}` : '—'}
              hint="base para alertas de consumo"
            />
          </>
        }
      />

      {serverErrors.length > 0 && (
        <Alert tone="danger" title="El servidor rechazó la distribución">
          <ul className="list-disc pl-5">
            {serverErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader title="Datos del modelo" />
        <CardBody>
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Marca" required value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
            <Input label="Modelo" required value={draft.model} onChange={(e) => set('model', e.target.value)} />
            <Select
              label="Tipo de servicio"
              value={draft.busType}
              onChange={(e) => {
                const busType = e.target.value as BusType
                // Al dejar de ser doble piso se descarta la planta alta
                setDraft((d) => ({
                  ...d,
                  busType,
                  layout:
                    busType !== 'double_decker' && d.layout.floors.length > 1
                      ? renumber({ floors: [d.layout.floors[0]] })
                      : d.layout,
                }))
              }}
              hint={
                draft.busType !== 'double_decker' && initial.layout.floors.length > 1
                  ? 'Se quitó la planta alta'
                  : undefined
              }
            >
              {BUS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BUS_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              label="Combustible"
              required
              value={draft.fuelTypeId}
              onChange={(e) => set('fuelTypeId', e.target.value)}
            >
              <option value="">Selecciona…</option>
              {fuels.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.unit})
                </option>
              ))}
            </Select>
            <Input
              label={`Tanque (${fuelUnit})`}
              type="number"
              min={0}
              step="0.01"
              className="font-data"
              value={draft.tankCapacity}
              onChange={(e) => set('tankCapacity', e.target.value)}
            />
            <Input
              label={`Rendimiento esperado (km/${fuelUnit})`}
              type="number"
              min={0}
              step="0.01"
              className="font-data"
              value={draft.expectedEfficiency}
              onChange={(e) => set('expectedEfficiency', e.target.value)}
            />
            <Input
              label="Preventivo cada (km)"
              type="number"
              min={500}
              step={500}
              className="font-data"
              hint="lo que ocurra primero"
              value={draft.preventiveKm}
              onChange={(e) => set('preventiveKm', e.target.value)}
            />
            <Input
              label="Preventivo cada (días)"
              type="number"
              min={7}
              className="font-data"
              value={draft.preventiveDays}
              onChange={(e) => set('preventiveDays', e.target.value)}
            />
            <div className="sm:col-span-2">
              <Input
                label="Características"
                hint="Separadas por coma: WiFi, A/C, pantallas, USB…"
                value={draft.features}
                onChange={(e) => set('features', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Especificaciones"
                rows={2}
                value={draft.specifications}
                onChange={(e) => set('specifications', e.target.value)}
              />
            </div>
            {id && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
                Modelo activo (los inactivos no se pueden asignar a unidades nuevas)
              </label>
            )}
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Distribución de asientos"
          description="La capacidad del modelo se calcula con los asientos que dibujes aquí"
        />
        <CardBody className="space-y-4">
          {canEdit && problems.length > 0 && <Alert tone="warning">{problems.join(' · ')}</Alert>}
          <LayoutEditor
            layout={draft.layout}
            onChange={(layout) => set('layout', layout)}
            maxFloors={maxFloors}
            readOnly={!canEdit}
          />
        </CardBody>
      </Card>
    </form>
  )
}

export default BusModelFormPage
