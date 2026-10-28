import { useState } from 'react'
import { Plus } from 'lucide-react'
import { formatInstantDate } from '../../lib/format'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { FuelLoadModal, type FuelPreset } from './FuelLoadModal'
import { FuelLoadsTable } from './FuelLoadsTable'
import { formatEfficiency, useFuelEfficiency, useFuelRole } from './useFleet'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="font-data text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-fg-muted">{hint}</div>}
    </div>
  )
}

/** Rendimiento real contra el esperado y el historial de cargas de una unidad. */
export function BusFuelTab({ busId }: { busId: string }) {
  const { canManage } = useFuelRole()
  const [preset, setPreset] = useState<FuelPreset | null>(null)
  const { data } = useFuelEfficiency(busId)
  const e = data?.[0]

  return (
    <div className="space-y-4">
      {e?.low && (
        <Alert tone="danger">
          La última medición quedó {e.dropPct} % por debajo del rendimiento esperado (umbral {e.threshold} %). Conviene
          revisar fugas, inyectores, presión de llantas o hábitos de manejo.
        </Alert>
      )}
      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Esperado del modelo" value={formatEfficiency(e?.expected ?? null, e?.unit)} />
            <Stat
              label="Última medición"
              value={formatEfficiency(e?.last ?? null, e?.unit)}
              hint={e?.lastAt ? formatInstantDate(e.lastAt) : 'Faltan dos tanques llenos'}
            />
            <Stat label="Promedio 90 días" value={formatEfficiency(e?.average90 ?? null, e?.unit)} />
            <Stat
              label="Variación"
              value={e?.dropPct == null ? '—' : `${e.dropPct > 0 ? '−' : '+'}${Math.abs(e.dropPct)} %`}
              hint="contra el esperado"
            />
          </div>
          {canManage && (
            <Button icon={Plus} onClick={() => setPreset({ busId })}>
              Registrar carga
            </Button>
          )}
        </CardBody>
      </Card>
      <FuelLoadsTable busId={busId} threshold={e?.threshold} />
      <FuelLoadModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}
