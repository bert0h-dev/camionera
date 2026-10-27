import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save, Undo2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { SettingItem, SettingValue } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
})

interface Props {
  title: ReactNode
  description?: string
  items: SettingItem[]
  /** Campos que ocupan el ancho completo */
  wide?: string[]
  /** Contenido extra bajo los campos (p. ej. un ejemplo calculado con los valores actuales) */
  preview?: (values: Record<string, SettingValue>) => ReactNode
  /** Muestra el botón para volver a los valores por defecto */
  resettable?: boolean
}

/** Formulario de una sección de parámetros: se guarda completa o no se guarda nada. */
export function SettingsForm({ title, description, items, wide = [], preview, resettable }: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const initial = Object.fromEntries(items.map((i) => [i.key, i.value]))
  const [values, setValues] = useState<Record<string, SettingValue>>(initial)
  const dirty = items.some((i) => values[i.key] !== i.value)

  const save = useMutation({
    mutationFn: () => api.patch('/settings', { values }),
    onSuccess: () => {
      toast.success('Configuración guardada')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const last = items.filter((i) => i.updatedAt).sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))[0]

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.key} className={cn(wide.includes(item.key) && 'sm:col-span-2')}>
                <SettingField
                  item={item}
                  value={values[item.key]}
                  multiline={wide.includes(item.key)}
                  onChange={(v) => setValues({ ...values, [item.key]: v })}
                />
              </div>
            ))}
          </div>

          {preview?.(values)}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-fg-muted">
              {last
                ? `Último cambio: ${last.updatedBy ?? 'sistema'} · ${DATE_TIME.format(new Date(last.updatedAt!))}`
                : 'Valores por defecto, aún sin cambios'}
            </span>
            <div className="flex flex-wrap gap-2">
              {resettable && items.some((i) => values[i.key] !== i.default) && (
                <Button
                  variant="ghost"
                  icon={Undo2}
                  onClick={() => setValues(Object.fromEntries(items.map((i) => [i.key, i.default])))}
                  title="Pone los valores por defecto; se aplican al guardar"
                >
                  Valores por defecto
                </Button>
              )}
              {dirty && (
                <Button variant="ghost" icon={RotateCcw} onClick={() => setValues(initial)}>
                  Descartar
                </Button>
              )}
              <Button type="submit" icon={Save} loading={save.isPending} disabled={!dirty}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function SettingField({
  item,
  value,
  multiline,
  onChange,
}: {
  item: SettingItem
  value: SettingValue
  multiline?: boolean
  onChange: (v: SettingValue) => void
}) {
  const label = item.label ?? item.description

  if (item.type === 'boolean')
    return (
      <label className="flex h-full items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-indigo-600"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-fg">{label}</span>
          <span className="block text-xs text-fg-muted">{item.description}</span>
        </span>
      </label>
    )

  if (item.type === 'number')
    return (
      <div className="relative">
        <Input
          label={label}
          type="number"
          min={item.min}
          max={item.max}
          step={item.decimals ? 1 / 10 ** item.decimals : 1}
          value={String(value)}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          hint={item.label ? item.description : `Entre ${item.min} y ${item.max}`}
          className={cn('font-data', item.unit && 'pr-10')}
        />
        {item.unit && (
          <span className="pointer-events-none absolute top-[2.15rem] right-3 text-sm text-fg-subtle">{item.unit}</span>
        )}
      </div>
    )

  return multiline ? (
    <Textarea
      label={label}
      rows={2}
      maxLength={item.maxLength}
      value={value as string}
      onChange={(e) => onChange(e.target.value)}
      hint={item.description}
    />
  ) : (
    <Input
      label={label}
      maxLength={item.maxLength}
      value={value as string}
      onChange={(e) => onChange(item.key === 'company.rfc' ? e.target.value.toUpperCase() : e.target.value)}
      hint={item.description}
      className={cn(['company.rfc', 'company.phone'].includes(item.key) && 'font-data')}
    />
  )
}
