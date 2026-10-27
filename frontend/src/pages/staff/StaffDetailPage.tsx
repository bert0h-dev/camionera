import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDate, formatPhone, staffFullName } from '../../lib/format'
import { ROLE_LABELS, STAFF_ROLE_LABELS, type Staff } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { GrantAccessModal } from './GrantAccessModal'
import { StaffStatusBadge } from './StaffStatusBadge'
import { TerminateModal } from './TerminateModal'
import { useCanEditStaff } from './useCanEditStaff'

// Las demás pestañas se habilitan en las fases 1.2 a 1.6
const TABS = [
  { key: 'general', label: 'General', enabled: true },
  { key: 'licenses', label: 'Licencias', enabled: false },
  { key: 'schedules', label: 'Turnos', enabled: false },
  { key: 'attendance', label: 'Asistencias', enabled: false },
  { key: 'evaluations', label: 'Evaluaciones', enabled: false },
  { key: 'payroll', label: 'Nómina', enabled: false },
]

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children || '—'}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 font-semibold text-slate-800">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  )
}

function StaffDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canEdit = useCanEditStaff()
  const [modal, setModal] = useState<'access' | 'terminate' | null>(null)

  const { data: s, isLoading, isError } = useQuery({
    queryKey: ['staff', id],
    queryFn: async () => (await api.get<Staff>(`/staff/${id}`)).data,
  })

  if (isLoading) return <p className="text-slate-500">Cargando…</p>
  if (isError || !s) return <p className="text-red-600">No se encontró el empleado.</p>

  const isTerminated = s.status === 'inactive'

  return (
    <div className="space-y-4">
      <Link to="/personal" className="text-sm text-blue-700 hover:underline">
        ← Personal
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{staffFullName(s)}</h1>
            <StaffStatusBadge status={s.status} />
          </div>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{s.employeeNumber}</span> · {STAFF_ROLE_LABELS[s.role]}
          </p>
        </div>
        {canEdit && !isTerminated && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/personal/${s.id}/editar`)}>
              Editar
            </Button>
            {!s.user && (
              <Button variant="secondary" onClick={() => setModal('access')}>
                Dar acceso al sistema
              </Button>
            )}
            <Button variant="danger" onClick={() => setModal('terminate')}>
              Dar de baja
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={!t.enabled}
            title={t.enabled ? undefined : 'Próximamente'}
            className={`border-b-2 px-4 py-2 text-sm whitespace-nowrap ${
              t.key === 'general'
                ? 'border-blue-600 font-semibold text-blue-700'
                : 'cursor-not-allowed border-transparent text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isTerminated && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-700">
          <strong>Baja el {formatDate(s.terminationDate)}.</strong> Motivo: {s.terminationReason}
        </div>
      )}

      <Card title="Datos personales">
        <Item label="Fecha de nacimiento">{formatDate(s.birthDate)}</Item>
        <Item label="CURP">{s.curp && <span className="font-mono">{s.curp}</span>}</Item>
        <Item label="RFC">{s.rfc && <span className="font-mono">{s.rfc}</span>}</Item>
        <Item label="NSS">{s.nss && <span className="font-mono">{s.nss}</span>}</Item>
        <Item label="Teléfono">{formatPhone(s.phone)}</Item>
        <Item label="Correo">{s.email}</Item>
        <div className="sm:col-span-2 lg:col-span-3">
          <Item label="Dirección">{s.address}</Item>
        </div>
      </Card>

      <Card title="Datos laborales">
        <Item label="Puesto">{STAFF_ROLE_LABELS[s.role]}</Item>
        <Item label="Fecha de contratación">{formatDate(s.hireDate)}</Item>
        <Item label="Acceso al sistema">
          {s.user ? (
            <>
              {s.user.email} · {ROLE_LABELS[s.user.role]}
              {!s.user.isActive && <span className="text-slate-500"> (desactivado)</span>}
            </>
          ) : (
            'Sin acceso'
          )}
        </Item>
      </Card>

      <Card title="Contacto de emergencia">
        <Item label="Nombre">{s.emergencyContact}</Item>
        <Item label="Teléfono">{s.emergencyPhone && formatPhone(s.emergencyPhone)}</Item>
      </Card>

      <GrantAccessModal staff={s} open={modal === 'access'} onClose={() => setModal(null)} />
      <TerminateModal staff={s} open={modal === 'terminate'} onClose={() => setModal(null)} />
    </div>
  )
}

export default StaffDetailPage
