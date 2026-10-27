import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDate, formatPhone, staffFullName } from '../../lib/format'
import {
  ROLE_LABELS,
  STAFF_ROLE_LABELS,
  type Compliance,
  type Staff,
  type StaffCertification,
  type StaffLicense,
} from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { StaffDocumentsTab } from './documents/StaffDocumentsTab'
import { StaffSchedulesTab } from './StaffSchedulesTab'
import { StaffAttendanceTab } from './StaffAttendanceTab'
import { StaffEvaluationsTab } from './StaffEvaluationsTab'
import { GrantAccessModal } from './GrantAccessModal'
import { StaffStatusBadge } from './StaffStatusBadge'
import { TerminateModal } from './TerminateModal'
import { useCanEditStaff } from './useCanEditStaff'

// Nómina se habilita en la fase 1.6
const TABS = [
  { key: 'general', label: 'General', enabled: true },
  { key: 'licenses', label: 'Licencias', enabled: true },
  { key: 'schedules', label: 'Turnos', enabled: true },
  { key: 'attendance', label: 'Asistencias', enabled: true },
  { key: 'evaluations', label: 'Evaluaciones', enabled: true },
  { key: 'payroll', label: 'Nómina', enabled: false },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Documentos vencidos que no tienen un reemplazo vigente del mismo tipo. */
function countExpired(licenses: StaffLicense[] = [], certs: StaffCertification[] = []) {
  const expiredLicenses = licenses.filter(
    (l) => l.status === 'expired' && !licenses.some((o) => o.licenseType === l.licenseType && o.status !== 'expired'),
  )
  const expiredCerts = certs.filter(
    (c) =>
      c.status === 'expired' && !certs.some((o) => o.type === c.type && o.name === c.name && o.status !== 'expired'),
  )
  return expiredLicenses.length + expiredCerts.length
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{children || '—'}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 font-semibold text-fg">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  )
}

function StaffDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canEdit = useCanEditStaff()
  const [modal, setModal] = useState<'access' | 'terminate' | null>(null)
  const [tab, setTab] = useState<TabKey>('general')

  const {
    data: s,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['staff', id],
    queryFn: async () => (await api.get<Staff>(`/staff/${id}`)).data,
  })
  // Mismas claves que la pestaña de documentos: se comparte la caché
  const licenses = useQuery({
    queryKey: ['staff', id, 'licenses'],
    queryFn: async () => (await api.get<StaffLicense[]>(`/staff/${id}/licenses`)).data,
  })
  const certifications = useQuery({
    queryKey: ['staff', id, 'certifications'],
    queryFn: async () => (await api.get<StaffCertification[]>(`/staff/${id}/certifications`)).data,
  })
  const compliance = useQuery({
    queryKey: ['staff', id, 'compliance'],
    queryFn: async () => (await api.get<Compliance>(`/staff/${id}/compliance`)).data,
    enabled: s?.role === 'driver' && s.status !== 'inactive',
  })

  if (isLoading) return <p className="text-fg-muted">Cargando…</p>
  if (isError || !s) return <p className="text-red-600 dark:text-red-300">No se encontró el empleado.</p>

  const isTerminated = s.status === 'inactive'
  const expiredCount = isTerminated ? 0 : countExpired(licenses.data, certifications.data)

  return (
    <div className="space-y-4">
      <Link to="/personal" className="text-sm text-link hover:underline">
        ← Personal
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-fg">{staffFullName(s)}</h1>
            <StaffStatusBadge status={s.status} />
          </div>
          <p className="text-sm text-fg-muted">
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

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={!t.enabled}
            title={t.enabled ? undefined : 'Próximamente'}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm whitespace-nowrap ${
              t.key === tab
                ? 'border-primary font-semibold text-link'
                : t.enabled
                  ? 'border-transparent text-fg-muted hover:text-fg'
                  : 'cursor-not-allowed border-transparent text-fg-subtle'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isTerminated && (
        <div className="rounded-lg border border-border-strong bg-surface-sunken p-4 text-sm text-fg">
          <strong>Baja el {formatDate(s.terminationDate)}.</strong> Motivo: {s.terminationReason}
        </div>
      )}

      {compliance.data && !compliance.data.compliant && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-4 text-sm text-red-800 dark:text-red-300">
          <strong>No puede asignarse a recorridos.</strong> Le falta: {compliance.data.missing.join(', ')}.
        </div>
      )}
      {expiredCount > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 p-4 text-sm text-amber-800 dark:text-amber-300">
          Tiene {expiredCount} documento(s) vencido(s).{' '}
          {tab !== 'licenses' && (
            <button type="button" className="font-semibold underline" onClick={() => setTab('licenses')}>
              Ver documentos
            </button>
          )}
        </div>
      )}

      {tab === 'licenses' && <StaffDocumentsTab staffId={s.id} canEdit={canEdit && !isTerminated} />}
      {tab === 'attendance' && <StaffAttendanceTab staffId={s.id} />}
      {tab === 'evaluations' && <StaffEvaluationsTab staffId={s.id} staffUserId={s.userId} editable={!isTerminated} />}
      {tab === 'schedules' && (
        <StaffSchedulesTab staffId={s.id} staffName={staffFullName(s)} editable={!isTerminated} />
      )}

      {tab === 'general' && (
        <>
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
                  {!s.user.isActive && <span className="text-fg-muted"> (desactivado)</span>}
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
        </>
      )}

      <GrantAccessModal staff={s} open={modal === 'access'} onClose={() => setModal(null)} />
      <TerminateModal staff={s} open={modal === 'terminate'} onClose={() => setModal(null)} />
    </div>
  )
}

export default StaffDetailPage
