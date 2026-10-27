import { useEffect, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { dateOnly } from '../../lib/format'
import { CURP_REGEX, NSS_REGEX, PHONE_REGEX, RFC_REGEX } from '../../lib/validation'
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  STAFF_STATUS_LABELS,
  type Staff,
} from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'

const EDITABLE_STATUSES = ['active', 'vacation', 'sick_leave', 'suspended'] as const

const optional = (regex: RegExp, message: string) =>
  z.string().trim().refine((v) => v === '' || regex.test(v), message)

const schema = z.object({
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  secondLastName: z.string().trim(),
  curp: optional(CURP_REGEX, 'CURP con formato inválido'),
  rfc: optional(RFC_REGEX, 'RFC con formato inválido'),
  nss: optional(NSS_REGEX, 'Debe tener 11 dígitos'),
  birthDate: z.string().min(1, 'Obligatorio'),
  email: z.string().trim().refine((v) => v === '' || z.email().safeParse(v).success, 'Correo inválido'),
  phone: z.string().regex(PHONE_REGEX, 'Debe tener 10 dígitos'),
  address: z.string().trim(),
  emergencyContact: z.string().trim(),
  emergencyPhone: optional(PHONE_REGEX, 'Debe tener 10 dígitos'),
  role: z.enum(STAFF_ROLES, 'Selecciona un puesto'),
  hireDate: z.string().min(1, 'Obligatorio'),
  status: z.enum(EDITABLE_STATUSES),
})
type FormValues = z.infer<typeof schema>

const OPTIONAL_FIELDS = [
  'secondLastName',
  'curp',
  'rfc',
  'nss',
  'email',
  'address',
  'emergencyContact',
  'emergencyPhone',
] as const

const EMPTY: FormValues = {
  firstName: '',
  lastName: '',
  secondLastName: '',
  curp: '',
  rfc: '',
  nss: '',
  birthDate: '',
  email: '',
  phone: '',
  address: '',
  emergencyContact: '',
  emergencyPhone: '',
  role: 'driver',
  hireDate: new Date().toISOString().slice(0, 10),
  status: 'active',
}

function toForm(s: Staff): FormValues {
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    secondLastName: s.secondLastName ?? '',
    curp: s.curp ?? '',
    rfc: s.rfc ?? '',
    nss: s.nss ?? '',
    birthDate: dateOnly(s.birthDate),
    email: s.email ?? '',
    phone: s.phone,
    address: s.address ?? '',
    emergencyContact: s.emergencyContact ?? '',
    emergencyPhone: s.emergencyPhone ?? '',
    role: s.role,
    hireDate: dateOnly(s.hireDate),
    status: s.status === 'inactive' ? 'active' : s.status,
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 font-semibold text-slate-800">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

const upperCase = (e: React.FormEvent<HTMLInputElement>) => {
  e.currentTarget.value = e.currentTarget.value.toUpperCase()
}
const digitsOnly = (e: React.FormEvent<HTMLInputElement>) => {
  e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '')
}

function StaffFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: async () => (await api.get<Staff>(`/staff/${id}`)).data,
    enabled: isEdit,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  useEffect(() => {
    if (staff) reset(toForm(staff))
  }, [staff, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Vacío = sin valor: en alta se omite; en edición se envía null para borrarlo
      const payload: Record<string, unknown> = { ...values }
      for (const key of OPTIONAL_FIELDS) {
        if (values[key] === '') payload[key] = isEdit ? null : undefined
      }
      if (!isEdit) delete payload.status
      return isEdit
        ? (await api.patch<Staff>(`/staff/${id}`, payload)).data
        : (await api.post<Staff>('/staff', payload)).data
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Empleado actualizado' : `Empleado ${saved.employeeNumber} creado`)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      navigate(`/personal/${saved.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (isEdit && isLoading) return <p className="text-slate-500">Cargando…</p>

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
      <h1 className="text-2xl font-bold text-slate-800">
        {isEdit ? `Editar empleado ${staff?.employeeNumber ?? ''}` : 'Nuevo empleado'}
      </h1>

      <Section title="Datos personales">
        <Input label="Nombre(s) *" error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Apellido paterno *" error={errors.lastName?.message} {...register('lastName')} />
        <Input label="Apellido materno" error={errors.secondLastName?.message} {...register('secondLastName')} />
        <Input label="Fecha de nacimiento *" type="date" error={errors.birthDate?.message} {...register('birthDate')} />
        <Input label="CURP" maxLength={18} onInput={upperCase} error={errors.curp?.message} {...register('curp')} />
        <Input label="RFC" maxLength={13} onInput={upperCase} error={errors.rfc?.message} {...register('rfc')} />
        <Input label="NSS" maxLength={11} inputMode="numeric" onInput={digitsOnly} error={errors.nss?.message} {...register('nss')} />
        <Input label="Teléfono *" maxLength={10} inputMode="numeric" onInput={digitsOnly} error={errors.phone?.message} {...register('phone')} />
        <Input label="Correo" type="email" error={errors.email?.message} {...register('email')} />
        <div className="sm:col-span-2 lg:col-span-3">
          <Textarea label="Dirección" rows={2} error={errors.address?.message} {...register('address')} />
        </div>
      </Section>

      <Section title="Datos laborales">
        <Select label="Puesto *" error={errors.role?.message} {...register('role')}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Input label="Fecha de contratación *" type="date" error={errors.hireDate?.message} {...register('hireDate')} />
        {isEdit && (
          <Select label="Estado" error={errors.status?.message} {...register('status')}>
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STAFF_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Section>

      <Section title="Contacto de emergencia">
        <Input label="Nombre" error={errors.emergencyContact?.message} {...register('emergencyContact')} />
        <Input
          label="Teléfono"
          maxLength={10}
          inputMode="numeric"
          onInput={digitsOnly}
          error={errors.emergencyPhone?.message}
          {...register('emergencyPhone')}
        />
      </Section>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(isEdit ? `/personal/${id}` : '/personal')}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

export default StaffFormPage
