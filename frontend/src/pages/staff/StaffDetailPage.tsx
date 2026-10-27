import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileBadge,
  KeyRound,
  Pencil,
  Phone,
  Star,
  User,
  UserMinus,
  Wallet,
} from 'lucide-react'
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
import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { StaffDocumentsTab } from './documents/StaffDocumentsTab'
import { StaffSchedulesTab } from './StaffSchedulesTab'
import { StaffAttendanceTab } from './StaffAttendanceTab'
import { StaffEvaluationsTab } from './StaffEvaluationsTab'
import { StaffPayrollTab } from './StaffPayrollTab'
import { useAuth } from '../../auth/useAuth'
import { NextShiftsCard, StaffQuickStats } from './StaffQuickSummary'
import { GrantAccessModal } from './GrantAccessModal'
import { StaffStatusBadge } from './StaffStatusBadge'
import { TerminateModal } from './TerminateModal'
import { useCanEditStaff } from './useCanEditStaff'

type TabKey = 'general' | 'licenses' | 'schedules' | 'attendance' | 'evaluations' | 'payroll'

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

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children || <span className="text-fg-subtle">—</span>}</dd>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof User; children: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-fg-subtle" />
            {title}
          </span>
        }
      />
      <CardBody>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
      </CardBody>
    </Card>
  )
}

function Meta({ icon: Icon, children }: { icon: typeof User; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-indigo-300" />
      {children}
    </span>
  )
}

function StaffDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canEdit = useCanEditStaff()
  const { user } = useAuth()
  const canSeePayroll = user?.role === 'admin' || user?.role === 'hr'
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

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  if (isError || !s)
    return (
      <Card>
        <EmptyState
          icon={User}
          title="No se encontró el empleado"
          description="Puede que el enlace sea incorrecto o que el registro ya no exista."
          action={
            <Button variant="secondary" onClick={() => navigate('/personal')}>
              Volver a Empleados
            </Button>
          }
        />
      </Card>
    )

  const isTerminated = s.status === 'inactive'
  const expiredCount = isTerminated ? 0 : countExpired(licenses.data, certifications.data)
  const name = staffFullName(s)

  const tabs: TabItem<TabKey>[] = [
    { key: 'general', label: 'General', icon: User },
    { key: 'licenses', label: 'Licencias', icon: FileBadge, badge: expiredCount },
    { key: 'schedules', label: 'Turnos', icon: CalendarClock },
    { key: 'attendance', label: 'Asistencias', icon: ClipboardCheck },
    { key: 'evaluations', label: 'Evaluaciones', icon: Star },
    // Salarios: solo RRHH y admin
    { key: 'payroll', label: 'Nómina', icon: Wallet, disabled: !canSeePayroll },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-4">
            <Avatar name={name} size="lg" className="size-16 text-xl ring-4 ring-amber-400/90" />
            <span className="flex flex-wrap items-center gap-3">
              {name}
              <StaffStatusBadge status={s.status} />
            </span>
          </span>
        }
        meta={
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-indigo-200 sm:pl-20">
            <span className="font-data font-semibold text-amber-400">{s.employeeNumber}</span>
            <Meta icon={Briefcase}>{STAFF_ROLE_LABELS[s.role]}</Meta>
            <Meta icon={Phone}>{formatPhone(s.phone)}</Meta>
            <Meta icon={CalendarDays}>Desde {formatDate(s.hireDate)}</Meta>
            <Meta icon={KeyRound}>
              {s.user ? (s.user.isActive ? `Acceso: ${ROLE_LABELS[s.user.role]}` : 'Acceso desactivado') : 'Sin acceso'}
            </Meta>
            {compliance.data?.compliant && (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <BadgeCheck className="size-4" />
                Apto para recorridos
              </span>
            )}
          </div>
        }
        actions={
          canEdit &&
          !isTerminated && (
            <>
              <Button variant="glass" icon={Pencil} onClick={() => navigate(`/personal/${s.id}/editar`)}>
                Editar
              </Button>
              {!s.user && (
                <Button variant="glass" icon={KeyRound} onClick={() => setModal('access')}>
                  Dar acceso
                </Button>
              )}
              <Button
                variant="glass"
                icon={UserMinus}
                className="hover:border-red-300/50 hover:bg-red-500/20"
                onClick={() => setModal('terminate')}
              >
                Dar de baja
              </Button>
            </>
          )
        }
        bottom={<Tabs items={tabs} value={tab} onChange={setTab} variant="band" />}
      />

      {isTerminated && (
        <Alert tone="neutral" title={`Baja el ${formatDate(s.terminationDate)}`}>
          Motivo: {s.terminationReason}
        </Alert>
      )}
      {compliance.data && !compliance.data.compliant && (
        <Alert tone="danger" title="No puede asignarse a recorridos">
          Le falta: {compliance.data.missing.join(', ')}.
        </Alert>
      )}
      {expiredCount > 0 && (
        <Alert
          tone="warning"
          title={`Tiene ${expiredCount} documento(s) vencido(s)`}
          action={
            tab !== 'licenses' && (
              <Button size="sm" variant="secondary" onClick={() => setTab('licenses')}>
                Ver documentos
              </Button>
            )
          }
        />
      )}

      {tab === 'licenses' && <StaffDocumentsTab staffId={s.id} canEdit={canEdit && !isTerminated} />}
      {tab === 'attendance' && <StaffAttendanceTab staffId={s.id} />}
      {tab === 'payroll' && canSeePayroll && <StaffPayrollTab staffId={s.id} editable={!isTerminated} />}
      {tab === 'evaluations' && <StaffEvaluationsTab staffId={s.id} staffUserId={s.userId} editable={!isTerminated} />}
      {tab === 'schedules' && <StaffSchedulesTab staffId={s.id} staffName={name} editable={!isTerminated} />}

      {tab === 'general' && !isTerminated && <StaffQuickStats staffId={s.id} />}
      {tab === 'general' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title="Datos personales" icon={User}>
              <Item label="Fecha de nacimiento">{formatDate(s.birthDate)}</Item>
              <Item label="CURP">{s.curp && <span className="font-mono">{s.curp}</span>}</Item>
              <Item label="RFC">{s.rfc && <span className="font-mono">{s.rfc}</span>}</Item>
              <Item label="NSS">{s.nss && <span className="font-mono">{s.nss}</span>}</Item>
              <Item label="Teléfono">{formatPhone(s.phone)}</Item>
              <Item label="Correo">{s.email}</Item>
              <Item label="Dirección" wide>
                {s.address}
              </Item>
            </Section>
            <Section title="Datos laborales" icon={Briefcase}>
              <Item label="Puesto">{STAFF_ROLE_LABELS[s.role]}</Item>
              <Item label="Fecha de contratación">{formatDate(s.hireDate)}</Item>
              <Item label="Acceso al sistema">
                {s.user ? (
                  <>
                    {s.user.email}
                    <span className="block text-xs text-fg-muted">
                      {ROLE_LABELS[s.user.role]}
                      {!s.user.isActive && ' · desactivado'}
                    </span>
                  </>
                ) : (
                  'Sin acceso'
                )}
              </Item>
            </Section>
          </div>
          <div className="space-y-6">
            {!isTerminated && <NextShiftsCard staffId={s.id} />}
            <Section title="Contacto de emergencia" icon={Phone}>
              <Item label="Nombre" wide>
                {s.emergencyContact}
              </Item>
              <Item label="Teléfono" wide>
                {s.emergencyPhone && formatPhone(s.emergencyPhone)}
              </Item>
            </Section>
          </div>
        </div>
      )}

      <GrantAccessModal staff={s} open={modal === 'access'} onClose={() => setModal(null)} />
      <TerminateModal staff={s} open={modal === 'terminate'} onClose={() => setModal(null)} />
    </div>
  )
}

export default StaffDetailPage
