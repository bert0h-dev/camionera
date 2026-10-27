import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { BUS_TYPE_LABELS, type BusDetail, type BusModel, type Paginated, type Terminal } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { LayoutEditor } from './LayoutEditor'

interface Draft {
  economicNumber: string
  plates: string
  vin: string
  year: string
  busModelId: string
  terminalId: string
  odometerKm: string
  preventiveKm: string
  preventiveDays: string
  notes: string
}

const THIS_YEAR = new Date().getFullYear()

const EMPTY: Draft = {
  economicNumber: '',
  plates: '',
  vin: '',
  year: String(THIS_YEAR),
  busModelId: '',
  terminalId: '',
  odometerKm: '0',
  preventiveKm: '',
  preventiveDays: '',
  notes: '',
}

const toDraft = (b: BusDetail): Draft => ({
  economicNumber: b.economicNumber,
  plates: b.plates,
  vin: b.vin,
  year: String(b.year),
  busModelId: b.busModelId,
  terminalId: b.terminalId,
  odometerKm: String(b.odometerKm),
  preventiveKm: b.preventiveKm ? String(b.preventiveKm) : '',
  preventiveDays: b.preventiveDays ? String(b.preventiveDays) : '',
  notes: b.notes ?? '',
})

const num = (v: string) => (v.trim() === '' ? null : Number(v))

function BusFormPage() {
  const { id } = useParams()
  const bus = useQuery({
    queryKey: ['fleet', 'buses', id],
    queryFn: async () => (await api.get<BusDetail>(`/fleet/buses/${id}`)).data,
    enabled: !!id,
  })
  if (bus.error) return <Alert tone="danger">{apiErrorMessage(bus.error, 'No se pudo cargar la unidad')}</Alert>
  if (id && !bus.data) return <LoadingBlock text="Cargando unidad…" />
  return <BusForm key={id ?? 'nueva'} bus={bus.data} />
}

function BusForm({ bus }: { bus?: BusDetail }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(bus ? toDraft(bus) : EMPTY)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const models = useQuery({
    queryKey: ['fleet', 'bus-models', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<BusModel>>('/fleet/bus-models', { params: { limit: 100 } })).data.data,
  })
  // Solo las terminales con ubicación se pueden asignar
  const terminals = useQuery({
    queryKey: ['fleet', 'terminals', 'located'],
    queryFn: async () => (await api.get<Terminal[]>('/fleet/terminals', { params: { located: true } })).data,
  })

  const model =
    models.data?.find((m) => m.id === draft.busModelId) ??
    (bus?.busModel.id === draft.busModelId ? bus.busModel : undefined)
  const modelLocked = !!bus && !bus.canChangeModel

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        economicNumber: draft.economicNumber,
        plates: draft.plates,
        vin: draft.vin,
        year: Number(draft.year),
        busModelId: draft.busModelId,
        terminalId: draft.terminalId,
        preventiveKm: num(draft.preventiveKm),
        preventiveDays: num(draft.preventiveDays),
        notes: draft.notes,
        ...(!bus && { odometerKm: Number(draft.odometerKm) || 0 }),
      }
      return bus
        ? (await api.patch<BusDetail>(`/fleet/buses/${bus.id}`, body)).data
        : (await api.post<BusDetail>('/fleet/buses', body)).data
    },
    onSuccess: (saved) => {
      toast.success(bus ? 'Unidad actualizada' : 'Unidad registrada')
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      navigate(`/flota/unidades/${saved.id}`, { replace: true })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const ready =
    draft.economicNumber.trim() &&
    draft.plates.trim().length >= 5 &&
    draft.vin.trim().length === 17 &&
    draft.busModelId &&
    draft.terminalId
  const modelChanging = !!bus && draft.busModelId !== bus.busModelId

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <PageHeader
        title={bus ? `Editar unidad ${bus.economicNumber}` : 'Nueva unidad'}
        description="Los asientos se copian del modelo; después se pueden bloquear uno por uno"
        actions={
          <>
            <Button
              variant="glass"
              icon={X}
              onClick={() => navigate(bus ? `/flota/unidades/${bus.id}` : '/flota/unidades')}
            >
              Cancelar
            </Button>
            <Button variant="accent" type="submit" icon={Save} loading={save.isPending} disabled={!ready}>
              Guardar
            </Button>
          </>
        }
        stats={
          <>
            <HeroStat
              label="Modelo"
              value={model ? `${model.brand} ${model.model}` : '—'}
              hint={model ? BUS_TYPE_LABELS[model.busType] : 'elige un modelo'}
            />
            <HeroStat label="Asientos" value={model?.seatCount ?? '—'} tone="primary" hint="se copian del modelo" />
            <HeroStat
              label="Preventivo"
              value={
                draft.preventiveKm || model?.preventiveKm
                  ? `${Number(draft.preventiveKm || model?.preventiveKm).toLocaleString('es-MX')} km`
                  : '—'
              }
              hint={draft.preventiveKm || draft.preventiveDays ? 'plan propio de la unidad' : 'plan del modelo'}
            />
            <HeroStat
              label="Odómetro"
              value={`${Number(draft.odometerKm || 0).toLocaleString('es-MX')} km`}
              hint={bus ? 'se actualiza desde el detalle' : 'lectura inicial'}
            />
          </>
        }
      />

      {modelChanging && (
        <Alert tone="warning">Al cambiar el modelo los asientos se vuelven a copiar y se pierden los bloqueos.</Alert>
      )}

      <Card>
        <CardHeader title="Datos de la unidad" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Número económico"
            required
            className="font-data"
            maxLength={20}
            value={draft.economicNumber}
            onChange={(e) => set('economicNumber', e.target.value)}
          />
          <Input
            label="Placas"
            required
            className="font-data uppercase"
            maxLength={15}
            value={draft.plates}
            onChange={(e) => set('plates', e.target.value.toUpperCase())}
          />
          <Input
            label="VIN"
            required
            className="font-data uppercase"
            maxLength={17}
            hint={`${draft.vin.length}/17 caracteres`}
            value={draft.vin}
            onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/\s/g, ''))}
          />
          <Input
            label="Año"
            type="number"
            required
            min={1980}
            max={THIS_YEAR + 1}
            className="font-data"
            value={draft.year}
            onChange={(e) => set('year', e.target.value)}
          />
          <Select
            label="Modelo"
            required
            disabled={modelLocked}
            hint={modelLocked ? 'No se puede cambiar: la unidad ya salió a servicio' : undefined}
            value={draft.busModelId}
            onChange={(e) => set('busModelId', e.target.value)}
          >
            <option value="">Selecciona…</option>
            {models.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brand} {m.model} · {m.seatCount} asientos
              </option>
            ))}
          </Select>
          <Select
            label="Terminal base"
            required
            hint={
              terminals.data && !terminals.data.length
                ? 'No hay terminales con ubicación; márcalas en Catálogos'
                : 'Solo aparecen las terminales ubicadas en el mapa'
            }
            value={draft.terminalId}
            onChange={(e) => set('terminalId', e.target.value)}
          >
            <option value="">Selecciona…</option>
            {terminals.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name}
              </option>
            ))}
          </Select>
          <Input
            label="Odómetro inicial (km)"
            type="number"
            min={0}
            className="font-data"
            disabled={!!bus}
            value={draft.odometerKm}
            onChange={(e) => set('odometerKm', e.target.value)}
          />
          <div />
          <Input
            label="Preventivo propio (km)"
            type="number"
            min={500}
            step={500}
            className="font-data"
            placeholder={model?.preventiveKm ? `Modelo: ${model.preventiveKm}` : ''}
            hint="Vacío = el del modelo"
            value={draft.preventiveKm}
            onChange={(e) => set('preventiveKm', e.target.value)}
          />
          <Input
            label="Preventivo propio (días)"
            type="number"
            min={7}
            className="font-data"
            placeholder={model?.preventiveDays ? `Modelo: ${model.preventiveDays}` : ''}
            hint="Vacío = el del modelo"
            value={draft.preventiveDays}
            onChange={(e) => set('preventiveDays', e.target.value)}
          />
          <div className="sm:col-span-2">
            <Textarea label="Notas" rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </CardBody>
      </Card>

      {model && (
        <Card>
          <CardHeader title="Asientos del modelo" description="Esta distribución se copia a la unidad" />
          <CardBody>
            <LayoutEditor
              layout={model.layout}
              onChange={() => {}}
              maxFloors={model.layout.floors.length > 1 ? 2 : 1}
              readOnly
            />
          </CardBody>
        </Card>
      )}
    </form>
  )
}

export default BusFormPage
