import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { IncidentsTable } from './IncidentsTable'
import { ReportIncidentModal, type ReportPreset } from './ReportIncidentModal'

/** Historial de incidencias de una unidad, con el botón para reportar una nueva. */
export function BusIncidentsTab({ busId }: { busId: string }) {
  const [preset, setPreset] = useState<ReportPreset | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setPreset({ busId })}>
          Reportar incidencia
        </Button>
      </div>
      <IncidentsTable busId={busId} />
      <ReportIncidentModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}
