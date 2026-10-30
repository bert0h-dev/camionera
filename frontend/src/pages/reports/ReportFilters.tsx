import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { PRESETS, presetRange } from './useReports'

/** Atajos de periodo y rango libre; vive en la URL del reporte. */
export function RangePicker({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const active = PRESETS.find((p) => {
    const r = presetRange(p.key)
    return r.from === from && r.to === to
  })?.key
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={active === p.key ? 'primary' : 'secondary'}
          onClick={() => onChange(presetRange(p.key))}
        >
          {p.label}
        </Button>
      ))}
      <div className="w-40">
        <Input
          type="date"
          aria-label="Desde"
          value={from}
          max={to}
          onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
        />
      </div>
      <span className="pb-2 text-sm text-fg-muted">a</span>
      <div className="w-40">
        <Input
          type="date"
          aria-label="Hasta"
          value={to}
          min={from}
          onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
        />
      </div>
    </div>
  )
}
