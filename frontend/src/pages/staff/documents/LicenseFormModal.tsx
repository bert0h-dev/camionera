import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../../lib/api'
import { dateOnly } from '../../../lib/format'
import { LICENSE_TYPE_LABELS, LICENSE_TYPES, type StaffLicense } from '../../../lib/types'
import { Button } from '../../../components/ui/Button'
import { Input, Select, Textarea } from '../../../components/ui/Field'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/toast-context'

const schema = z
  .object({
    licenseType: z.enum(LICENSE_TYPES),
    licenseNumber: z.string().trim().min(3, 'Mínimo 3 caracteres'),
    issuer: z.string().trim().min(2, 'Obligatorio'),
    issueDate: z.string().min(1, 'Obligatorio'),
    expiryDate: z.string().min(1, 'Obligatorio'),
    notes: z.string(),
  })
  .refine((v) => !v.issueDate || !v.expiryDate || v.expiryDate > v.issueDate, {
    path: ['expiryDate'],
    message: 'Debe ser posterior a la expedición',
  })
type FormValues = z.infer<typeof schema>

interface Props {
  staffId: string
  license: StaffLicense | null // null = alta
  open: boolean
  onClose: () => void
}

export function LicenseFormModal({ staffId, license, open, onClose }: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEdit = !!license

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!open) return
    reset(
      license
        ? {
            licenseType: license.licenseType,
            licenseNumber: license.licenseNumber,
            issuer: license.issuer,
            issueDate: dateOnly(license.issueDate),
            expiryDate: dateOnly(license.expiryDate),
            notes: license.notes ?? '',
          }
        : { licenseType: 'A', licenseNumber: '', issuer: 'SICT', issueDate: '', expiryDate: '', notes: '' },
    )
  }, [open, license, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) await api.patch(`/staff/licenses/${license.id}`, values)
      else await api.post(`/staff/${staffId}/licenses`, values)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Licencia actualizada' : 'Licencia agregada')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={open} title={isEdit ? 'Editar licencia' : 'Nueva licencia'} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <Select label="Tipo" error={errors.licenseType?.message} {...register('licenseType')}>
          {LICENSE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LICENSE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Número" error={errors.licenseNumber?.message} {...register('licenseNumber')} />
          <Input label="Expedida por" error={errors.issuer?.message} {...register('issuer')} />
          <Input label="Fecha de expedición" type="date" error={errors.issueDate?.message} {...register('issueDate')} />
          <Input label="Fecha de vencimiento" type="date" error={errors.expiryDate?.message} {...register('expiryDate')} />
        </div>
        <Textarea label="Notas" rows={2} {...register('notes')} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
