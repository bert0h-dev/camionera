import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../../lib/api'
import { dateOnly } from '../../../lib/format'
import {
  CERTIFICATION_TYPE_LABELS,
  CERTIFICATION_TYPES,
  type StaffCertification,
} from '../../../lib/types'
import { Button } from '../../../components/ui/Button'
import { Input, Select, Textarea } from '../../../components/ui/Field'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/toast-context'

const schema = z
  .object({
    type: z.enum(CERTIFICATION_TYPES),
    name: z.string().trim().min(2, 'Obligatorio'),
    issuer: z.string(),
    certificateNumber: z.string(),
    issueDate: z.string().min(1, 'Obligatorio'),
    expiryDate: z.string(), // vacío = no vence
    notes: z.string(),
  })
  .refine((v) => !v.expiryDate || !v.issueDate || v.expiryDate > v.issueDate, {
    path: ['expiryDate'],
    message: 'Debe ser posterior a la expedición',
  })
type FormValues = z.infer<typeof schema>

// Nombre sugerido al elegir el tipo (si el usuario no ha escrito uno propio)
const DEFAULT_NAMES: Partial<Record<FormValues['type'], string>> = {
  medical_exam: 'Examen psicofísico integral',
  first_aid: 'Curso de primeros auxilios',
  defensive_driving: 'Curso de manejo defensivo',
}

interface Props {
  staffId: string
  certification: StaffCertification | null
  open: boolean
  onClose: () => void
}

export function CertificationFormModal({ staffId, certification, open, onClose }: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEdit = !!certification

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!open) return
    const c = certification
    reset({
      type: c?.type ?? 'medical_exam',
      name: c?.name ?? DEFAULT_NAMES.medical_exam!,
      issuer: c?.issuer ?? '',
      certificateNumber: c?.certificateNumber ?? '',
      issueDate: c ? dateOnly(c.issueDate) : '',
      expiryDate: c ? dateOnly(c.expiryDate) : '',
      notes: c?.notes ?? '',
    })
  }, [open, certification, reset])

  const typeField = register('type', {
    onChange: () => {
      const suggested = DEFAULT_NAMES[getValues('type')]
      if (!isEdit && !dirtyFields.name) setValue('name', suggested ?? '')
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Vacío se envía como null para borrar el dato (el backend también lo trata así)
      const payload = { ...values, expiryDate: values.expiryDate || null }
      if (isEdit) await api.patch(`/staff/certifications/${certification.id}`, payload)
      else await api.post(`/staff/${staffId}/certifications`, payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Certificación actualizada' : 'Certificación agregada')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={open} title={isEdit ? 'Editar certificación' : 'Nueva certificación'} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo" error={errors.type?.message} {...typeField}>
            {CERTIFICATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {CERTIFICATION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Input label="Nombre" error={errors.name?.message} {...register('name')} />
          <Input label="Expedido por" {...register('issuer')} />
          <Input label="Número / folio" {...register('certificateNumber')} />
          <Input label="Fecha de expedición" type="date" error={errors.issueDate?.message} {...register('issueDate')} />
          <Input
            label="Fecha de vencimiento (opcional)"
            type="date"
            error={errors.expiryDate?.message}
            {...register('expiryDate')}
          />
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
