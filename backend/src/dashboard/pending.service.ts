import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { DOCUMENT_LABELS } from '../fleet/bus-rules.js';
import { BusesService } from '../fleet/buses.service.js';
import { FUEL_MANAGERS, FuelService } from '../fleet/fuel.service.js';
import { MaintenanceService } from '../fleet/maintenance.service.js';
import {
  INCIDENT_SEVERITY_LABELS,
  incidentFolio,
} from '../fleet/incident-rules.js';
import { IncidentsService } from '../fleet/incidents.service.js';
import { orderFolio } from '../fleet/maintenance-rules.js';
import {
  IncidentSeverity,
  IncidentStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { ROUTE_EDITORS } from '../routes/routes.controller.js';
import { daysLabel, timeKey } from '../routes/schedule-rules.js';
import { SchedulesService } from '../routes/schedules.service.js';
import { dateKey, daysBetween, today } from '../common/dates.js';
import { wallTime } from '../routes/route-rules.js';
import { TripAssignmentService } from '../trips/trip-assignment.service.js';
import { TripStatusService } from '../trips/trip-status.service.js';
import { CASH_SUPERVISORS, CashService } from '../cash/cash.service.js';
import { TripsService } from '../trips/trips.service.js';
import { StaffDocumentsService } from '../staff/documents/staff-documents.service.js';

export type PendingArea =
  | 'staff'
  | 'fleet'
  | 'maintenance'
  | 'incident'
  | 'fuel'
  | 'route'
  | 'trip'
  | 'cash';
export type PendingSeverity = 'overdue' | 'soon';

export interface PendingItem {
  id: string;
  area: PendingArea;
  severity: PendingSeverity;
  title: string;
  detail: string;
  /** Fecha límite (o de vencimiento) cuando aplica */
  date: Date | null;
  /** Días que faltan; negativo = vencido */
  daysLeft: number | null;
  /** Ruta de la app para atenderlo */
  link: string;
}

const STAFF_AREA: UserRole[] = [
  UserRole.admin,
  UserRole.hr,
  UserRole.supervisor,
  UserRole.coordinator,
];
const FLEET_AREA: UserRole[] = [
  UserRole.admin,
  UserRole.coordinator,
  UserRole.supervisor,
];

const DAY_MS = 86_400_000;
const URGENT_MS = 6 * 3_600_000;

/** '30/10 14:05' en hora de la terminal de origen, como en Recorridos */
const departure = (
  at: Date,
  route: { originTerminal: { city: { timezone: string } } },
) => {
  const w = wallTime(at, route.originTerminal.city.timezone);
  return `${w.date.slice(8)}/${w.date.slice(5, 7)} ${w.time}`;
};

const staffName = (s: {
  firstName: string;
  lastName: string;
  secondLastName: string | null;
}) => [s.firstName, s.lastName, s.secondLastName].filter(Boolean).join(' ');

/**
 * Lista única de lo que hay que atender, de todas las áreas que el rol puede ver:
 * documentos del personal, documentos de unidades, preventivos vencidos o próximos
 * incidencias abiertas, rendimiento de combustible bajo y cargas por confirmar.
 * Ordenada por urgencia: primero lo vencido, luego lo que vence antes.
 */
@Injectable()
export class PendingService {
  constructor(
    private readonly staffDocs: StaffDocumentsService,
    private readonly buses: BusesService,
    private readonly maintenance: MaintenanceService,
    private readonly incidents: IncidentsService,
    private readonly fuel: FuelService,
    private readonly schedules: SchedulesService,
    private readonly trips: TripsService,
    private readonly assignment: TripAssignmentService,
    private readonly tripStatus: TripStatusService,
    private readonly cash: CashService,
  ) {}

  async list(user: AuthUser): Promise<PendingItem[]> {
    const staff = STAFF_AREA.includes(user.role);
    const fleet = FLEET_AREA.includes(user.role);
    const fuelManager = FUEL_MANAGERS.includes(user.role);
    const cashSupervisor = CASH_SUPERVISORS.includes(user.role);
    const routes =
      user.role === UserRole.admin ||
      (ROUTE_EDITORS as UserRole[]).includes(user.role);
    const [
      staffDocs,
      busDocs,
      plan,
      incidents,
      lowFuel,
      fuelLoads,
      unscheduled,
      expiring,
      unassigned,
      unfit,
      stale,
      lateDepartures,
      openArrivals,
      openCash,
      cashDiffs,
    ] = await Promise.all([
      staff ? this.staffDocs.expirations() : null,
      fleet ? this.buses.expiringDocuments() : null,
      fleet ? this.maintenance.plan() : null,
      fleet ? this.incidents.open() : null,
      fleet ? this.fuel.lowEfficiency() : null,
      fuelManager ? this.fuel.pendingLoads() : null,
      routes ? this.schedules.routesWithoutSchedules() : null,
      routes ? this.schedules.expiringSchedules() : null,
      fleet
        ? this.assignment.unassignedBefore(new Date(Date.now() + DAY_MS))
        : null,
      fleet ? this.assignment.busesNoLongerFit() : null,
      routes ? this.trips.staleTrips() : null,
      fleet ? this.tripStatus.lateDepartures() : null,
      fleet ? this.tripStatus.openArrivals() : null,
      cashSupervisor ? this.cash.openTooLong() : null,
      cashSupervisor ? this.cash.recentDifferences() : null,
    ]);
    const now = Date.now();

    const items: PendingItem[] = [
      ...(staffDocs?.items ?? []).map((d) => ({
        id: `staff-${d.kind}-${d.id}`,
        area: 'staff' as const,
        severity:
          d.status === 'expired' ? ('overdue' as const) : ('soon' as const),
        title: staffName(d.staff),
        detail: `${d.label}${d.number ? ` (${d.number})` : ''} · ${d.staff.employeeNumber}`,
        date: d.expiryDate,
        daysLeft: d.daysToExpiry,
        link: `/personal/${d.staff.id}`,
      })),
      ...(busDocs ?? []).map((d) => ({
        id: `bus-doc-${d.id}`,
        area: 'fleet' as const,
        severity:
          d.status === 'expired' ? ('overdue' as const) : ('soon' as const),
        title: `Unidad ${d.bus.economicNumber}`,
        detail: `${DOCUMENT_LABELS[d.type]} · ${d.folio}`,
        date: d.expiryDate,
        daysLeft: d.daysToExpiry,
        link: `/flota/unidades/${d.bus.id}`,
      })),
      ...(plan ?? [])
        .filter((p) => p.status === 'overdue' || p.status === 'due_soon')
        .map((p) => {
          const km =
            p.kmLeft === null
              ? null
              : p.kmLeft < 0
                ? `${(-p.kmLeft).toLocaleString('es-MX')} km pasado`
                : `faltan ${p.kmLeft.toLocaleString('es-MX')} km`;
          const order = p.openOrder
            ? `${orderFolio(p.openOrder.folio)} programada`
            : 'sin orden';
          return {
            id: `service-${p.bus.id}`,
            area: 'maintenance' as const,
            severity:
              p.status === 'overdue' ? ('overdue' as const) : ('soon' as const),
            title: `Preventivo unidad ${p.bus.economicNumber}`,
            detail: [km, order].filter(Boolean).join(' · '),
            date: p.dueDate,
            daysLeft: p.daysLeft,
            link: p.openOrder
              ? `/flota/mantenimiento/${p.openOrder.id}`
              : `/flota/unidades/${p.bus.id}`,
          };
        }),
      ...(incidents ?? []).map((i) => ({
        id: `incident-${i.id}`,
        area: 'incident' as const,
        // Las críticas y altas se atienden ya; las demás se pueden programar
        severity:
          i.severity === IncidentSeverity.critical ||
          i.severity === IncidentSeverity.high
            ? ('overdue' as const)
            : ('soon' as const),
        title: `${INCIDENT_SEVERITY_LABELS[i.severity]} · unidad ${i.bus.economicNumber}`,
        detail: `${incidentFolio(i.folio)} · ${i.category.name} · ${
          i.status === IncidentStatus.reported ? 'sin revisar' : 'en revisión'
        }`,
        // Sin fecha límite: Inicio muestra cuánto lleva abierta
        date: null,
        // Días abierta, en negativo para que las más antiguas suban
        daysLeft: -Math.floor((now - i.occurredAt.getTime()) / 86_400_000),
        link: `/flota/incidencias/${i.id}`,
      })),
      ...(lowFuel ?? []).map((e) => ({
        id: `fuel-low-${e.bus.id}`,
        area: 'fuel' as const,
        severity: 'soon' as const,
        title: `Rendimiento bajo · unidad ${e.bus.economicNumber}`,
        detail: `${e.last} km/${e.unit} contra ${e.expected} esperado (−${e.dropPct} %)`,
        date: null,
        daysLeft: null,
        link: `/flota/unidades/${e.bus.id}?tab=fuel`,
      })),
      ...(fuelLoads ?? []).map((l) => ({
        id: `fuel-pending-${l.id}`,
        area: 'fuel' as const,
        severity: 'soon' as const,
        title: `Carga por confirmar · unidad ${l.bus.economicNumber}`,
        detail: `${Number(l.quantity).toLocaleString('es-MX')} ${l.fuelType.unit} · ${l.recorder.fullName}`,
        date: null,
        // Días esperando, en negativo para que las más antiguas suban
        daysLeft: -Math.floor((now - l.createdAt.getTime()) / 86_400_000),
        link: '/flota/combustible?status=pending',
      })),
      ...(unscheduled ?? []).map((r) => {
        const next = r.schedules[0]?.validFrom ?? null;
        return {
          id: `route-unscheduled-${r.id}`,
          area: 'route' as const,
          severity: 'overdue' as const,
          title: `Ruta sin horarios · ${r.code}`,
          detail: next
            ? `${r.name} · los horarios empiezan el ${dateKey(next)}`
            : `${r.name} · está activa pero no tiene salidas vigentes`,
          date: next,
          daysLeft: next ? daysBetween(today(), next) : null,
          link: `/rutas/${r.id}?tab=schedules`,
        };
      }),
      ...(expiring ?? []).map((s) => ({
        id: `route-expiring-${s.id}`,
        area: 'route' as const,
        severity: 'soon' as const,
        title: `Horario por vencer · ${s.route.code}`,
        detail: `Salida ${timeKey(s.departureTime)} (${daysLabel(s.daysOfWeek)}) · ${s.route.name}`,
        date: s.validUntil,
        daysLeft: s.validUntil ? daysBetween(today(), s.validUntil) : null,
        link: `/rutas/${s.route.id}?tab=schedules`,
      })),
      ...(unassigned ?? []).map((t) => {
        const missing = [!t.busId && 'unidad', !t.driverId && 'conductor']
          .filter(Boolean)
          .join(' y ');
        return {
          id: `trip-unassigned-${t.id}`,
          area: 'trip' as const,
          // A menos de 6 h de salir ya es urgente
          severity:
            t.departureAt.getTime() - now < URGENT_MS
              ? ('overdue' as const)
              : ('soon' as const),
          title: `Sin ${missing} · ${t.tripNumber}`,
          detail: `Sale ${departure(t.departureAt, t.route)} · ${t.route.name}`,
          date: null,
          daysLeft: null,
          link: `/recorridos/${t.id}`,
        };
      }),
      ...(unfit ?? []).map((t) => ({
        id: `trip-unfit-${t.id}`,
        area: 'trip' as const,
        severity: 'overdue' as const,
        title: `Unidad no disponible · ${t.tripNumber}`,
        detail: `La ${t.bus!.economicNumber} está ${
          t.bus!.status === 'maintenance'
            ? 'en mantenimiento'
            : 'fuera de servicio'
        } · sale ${departure(t.departureAt, t.route)}`,
        date: null,
        daysLeft: null,
        link: `/recorridos/${t.id}`,
      })),
      ...(stale ?? []).map((t) => ({
        id: `trip-stale-${t.id}`,
        area: 'trip' as const,
        severity: 'soon' as const,
        title: `Horario cambiado · ${t.tripNumber}`,
        detail: `Ya está asignado; su horario cambió o se desactivó · ${t.route.name}`,
        date: null,
        daysLeft: null,
        link: `/recorridos/${t.id}`,
      })),
      ...(lateDepartures ?? []).map((t) => ({
        id: `trip-late-${t.id}`,
        area: 'trip' as const,
        severity: 'overdue' as const,
        title: `Debió salir · ${t.tripNumber}`,
        detail: `Salida ${departure(t.departureAt, t.route)} · sigue ${
          t.status === 'boarding' ? 'abordando' : 'programado'
        } · ${t.route.name}`,
        date: null,
        daysLeft: null,
        link: `/recorridos/${t.id}`,
      })),
      ...(openArrivals ?? []).map((t) => ({
        id: `trip-open-${t.id}`,
        area: 'trip' as const,
        severity: 'overdue' as const,
        title: `Sin cerrar · ${t.tripNumber}`,
        detail: `Debió llegar ${departure(t.arrivalAt, { originTerminal: t.route.destinationTerminal })} · captura la llegada y el odómetro`,
        date: null,
        daysLeft: null,
        link: `/recorridos/${t.id}`,
      })),
      ...(openCash ?? []).map((c) => ({
        id: `cash-open-${c.id}`,
        area: 'cash' as const,
        severity: 'overdue' as const,
        title: `Caja sin corte · ${c.user.fullName}`,
        detail: `Abierta hace ${Math.floor((now - c.openedAt.getTime()) / 3_600_000)} h${c.terminal ? ` · ${c.terminal.code}` : ''}`,
        date: c.openedAt,
        daysLeft: null,
        link: `/caja?id=${c.id}`,
      })),
      ...(cashDiffs ?? []).map((c) => {
        const diff = Number(c.difference);
        return {
          id: `cash-diff-${c.id}`,
          area: 'cash' as const,
          severity: 'soon' as const,
          title: `Corte con ${diff < 0 ? 'faltante' : 'sobrante'} · ${c.user.fullName}`,
          detail: `${diff < 0 ? '−' : '+'}$${Math.abs(diff).toFixed(2)}${c.closingNotes ? ` · ${c.closingNotes}` : ''}`,
          date: c.closedAt,
          daysLeft: null,
          link: `/caja?id=${c.id}`,
        };
      }),
    ];

    const rank = (i: PendingItem) => (i.severity === 'overdue' ? 0 : 1);
    return items.sort(
      (a, b) => rank(a) - rank(b) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0),
    );
  }
}
