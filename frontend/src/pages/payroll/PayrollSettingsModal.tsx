import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import type { PayrollSettings } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { usePayrollSettings } from './usePayrollSettings'

export function PayrollSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePayrollSettings()
  return (
    <Modal
      open={open}
      title="Configuración de la prenómina"
      description="Aplica a los periodos que se generen o regeneren a partir de ahora"
      onClose={onClose}
    >
      {open &&
        (data ? (
          <SettingsForm key={String(data.latesPerAbsence)} initial={data} onClose={onClose} />
        ) : (
          <LoadingBlock />
        ))}
    </Modal>
  )
}

function SettingsForm({ initial, onClose }: { initial: PayrollSettings; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(initial.latePenaltyEnabled)
  const [perAbsence, setPerAbsence] = useState(String(initial.latesPerAbsence))

  const save = useMutation({
    mutationFn: () =>
      api.patch('/payroll/settings', { latePenaltyEnabled: enabled, latesPerAbsence: Number(perAbsence) }),
    onSuccess: () => {
      toast.success('Configuración guardada')
      queryClient.invalidateQueries({ queryKey: ['payroll', 'settings'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const n = Number(perAbsence)
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-indigo-600"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-fg">Descontar faltas por acumulación de retardos</span>
          <span className="block text-xs text-fg-muted">
            Si está apagado, los retardos solo se informan en la prenómina sin afectar el pago.
          </span>
        </span>
      </label>
      {enabled && (
        <div className="flex items-end gap-3">
          <div className="w-32">
            <Input
              label="Retardos"
              type="number"
              min={1}
              max={20}
              value={perAbsence}
              onChange={(e) => setPerAbsence(e.target.value)}
            />
          </div>
          <p className="pb-2 text-sm text-fg-muted">= 1 falta descontada</p>
        </div>
      )}
      {enabled && n >= 1 && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
          Ejemplo: con {n * 2 + 1} retardos en el periodo se descuentan {2} día(s).
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={enabled && (!n || n < 1 || n > 20)}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
