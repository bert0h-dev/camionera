import { Input, Select } from '../../components/ui/Field'
import type { PaymentMethod } from '../../lib/types'
import { METHOD_LABELS } from './useTickets'

export interface RefundDraft {
  method: Exclude<PaymentMethod, 'mercadopago'>
  reference: string
}

/** Cómo se devuelve: efectivo sale de la caja; tarjeta y transferencia piden la referencia de la devolución. */
export function RefundFields({ value, onChange }: { value: RefundDraft; onChange: (v: RefundDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <Select
        label="Se devuelve en"
        value={value.method}
        onChange={(e) => onChange({ ...value, method: e.target.value as RefundDraft['method'] })}
      >
        {(['cash', 'card', 'transfer'] as const).map((m) => (
          <option key={m} value={m}>
            {METHOD_LABELS[m]}
          </option>
        ))}
      </Select>
      {value.method === 'cash' ? (
        <p className="self-end pb-2 text-xs text-fg-muted">Sale del efectivo de tu caja.</p>
      ) : (
        <Input
          label={
            value.method === 'card' ? 'Referencia de la devolución en la terminal' : 'Referencia de la transferencia'
          }
          required
          value={value.reference}
          onChange={(e) => onChange({ ...value, reference: e.target.value })}
        />
      )}
    </div>
  )
}
