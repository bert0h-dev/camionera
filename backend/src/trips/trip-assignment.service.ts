import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateKey } from '../common/dates.js';
import {
  ActionType,
  StaffRole,
  TripStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  ASSIGNABLE_STATUSES,
  assignable,
  busIssues,
  collectorIssues,
  driverIssues,
  type Issue,
  type StaffCandidate,
  type TripWindow,
} from './assignment-rules.js';
import { AssignTripDto } from './dto/trip.dto.js';

const DAY = 86_400_000;
/** Margen alrededor del viaje para buscar choques, el recorrido anterior y las horas del día */
const LOOKAROUND = 2 * DAY;

const windowSelect = {
  id: true,
  tripNumber: true,
  tripDate: true,
  departureAt: true,
  arrivalAt: true,
  durationMinutes: true,
  busId: true,
  driverId: true,
  collectorId: true,
  route: {
    select: {
      originTerminalId: true,
      destinationTerminalId: true,
      destinationTerminal: { select: { code: true } },
    },
  },
} as const;

type WindowRow = {
  id: string;
  tripNumber: string;
  tripDate: Date;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
  busId: string | null;
  driverId: string | null;
  collectorId: string | null;
  route: {
    originTerminalId: string;
    destinationTerminalId: string;
    destinationTerminal: { code: string };
  };
};

const toWindow = (t: WindowRow): TripWindow => ({
  id: t.id,
  tripNumber: t.tripNumber,
  tripDate: dateKey(t.tripDate),
  departureAt: t.departureAt,
  arrivalAt: t.arrivalAt,
  durationMinutes: t.durationMinutes,
  originTerminalId: t.route.originTerminalId,
  destinationTerminalId: t.route.destinationTerminalId,
  destinationCode: t.route.destinationTerminal.code,
});

const by = <K extends 'busId' | 'driverId' | 'collectorId'>(
  rows: WindowRow[],
  key: K,
) => {
  const map = new Map<string, TripWindow[]>();
  for (const r of rows) {
    const id = r[key];
    if (!id) continue;
    map.set(id, [...(map.get(id) ?? []), toWindow(r)]);
  }
  return map;
};

const rank = (issues: Issue[]) =>
  issues.some((i) => i.level === 'block')
    ? 2
    : issues.some((i) => i.level === 'override')
      ? 1
      : 0;

/** Asignación de unidad, conductor y cobrador con las validaciones de disponibilidad. */
@Injectable()
export class TripAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private async trip(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      select: { ...windowSelect, status: true, overrideReason: true },
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    return trip;
  }

  /** Recorridos activos (no cancelados) cerca de las fechas del viaje. */
  private nearby(trip: WindowRow) {
    return this.prisma.trip.findMany({
      where: {
        status: { not: TripStatus.cancelled },
        departureAt: { lt: new Date(trip.arrivalAt.getTime() + LOOKAROUND) },
        arrivalAt: { gt: new Date(trip.departureAt.getTime() - LOOKAROUND) },
        OR: [
          { busId: { not: null } },
          { driverId: { not: null } },
          { collectorId: { not: null } },
        ],
      },
      select: windowSelect,
    });
  }

  private async limits() {
    const [turnaround, gap, maxShift] = await Promise.all([
      this.settings.get('trips.unit_turnaround_minutes'),
      this.settings.get('trips.driver_gap_minutes'),
      this.settings.get('schedules.max_shift_hours'),
    ]);
    return { turnaround, gap, maxShift };
  }

  private buses(ids?: string[]) {
    return this.prisma.bus.findMany({
      where: { id: ids ? { in: ids } : undefined },
      select: {
        id: true,
        economicNumber: true,
        status: true,
        terminalId: true,
        terminal: { select: { code: true, latitude: true } },
        busModel: { select: { brand: true, model: true } },
        documents: {
          select: { type: true, issueDate: true, expiryDate: true },
        },
        _count: { select: { seats: { where: { isBlocked: false } } } },
      },
      orderBy: { economicNumber: 'asc' },
    });
  }

  private staff(tripDate: Date, roles: StaffRole[], ids?: string[]) {
    return this.prisma.staff.findMany({
      where: ids
        ? { id: { in: ids } }
        : { role: { in: roles }, status: { not: 'inactive' } },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        secondLastName: true,
        role: true,
        status: true,
        licenses: { select: { expiryDate: true } },
        schedules: {
          where: { scheduleDate: tripDate },
          select: { isRestDay: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private staffCandidate(s: {
    role: StaffRole;
    status: string;
    licenses: { expiryDate: Date }[];
    schedules: { isRestDay: boolean }[];
  }): StaffCandidate {
    return {
      role: s.role,
      status: s.status,
      licenseExpiries: s.licenses.map((l) => l.expiryDate),
      restDay: s.schedules.some((x) => x.isRestDay),
    };
  }

  /** Unidades, conductores y cobradores con sus observaciones para este recorrido; los aptos primero. */
  async candidates(id: string) {
    const row = await this.trip(id);
    const trip = toWindow(row);
    const [nearby, limits, buses, people] = await Promise.all([
      this.nearby(row),
      this.limits(),
      this.buses(),
      this.staff(row.tripDate, [StaffRole.driver, StaffRole.collector]),
    ]);
    const busTrips = by(nearby, 'busId');
    const driverTrips = by(nearby, 'driverId');
    const collectorTrips = by(nearby, 'collectorId');
    const sort = <T extends { issues: Issue[] }>(list: T[]) =>
      list.sort((a, b) => rank(a.issues) - rank(b.issues));

    const person = (p: (typeof people)[number]) => ({
      id: p.id,
      employeeNumber: p.employeeNumber,
      firstName: p.firstName,
      lastName: p.lastName,
      secondLastName: p.secondLastName,
    });
    return {
      buses: sort(
        buses.map((b) => ({
          id: b.id,
          economicNumber: b.economicNumber,
          model: `${b.busModel.brand} ${b.busModel.model}`,
          seats: b._count.seats,
          issues: busIssues(
            {
              status: b.status,
              terminalId: b.terminalId,
              terminalCode: b.terminal.code,
              terminalLocated: b.terminal.latitude !== null,
              seats: b._count.seats,
              documents: b.documents,
            },
            trip,
            busTrips.get(b.id) ?? [],
            limits.turnaround,
          ),
        })),
      ),
      drivers: sort(
        people
          .filter((p) => p.role === StaffRole.driver)
          .map((p) => ({
            ...person(p),
            issues: driverIssues(
              this.staffCandidate(p),
              trip,
              driverTrips.get(p.id) ?? [],
              limits.gap,
              limits.maxShift,
            ),
          })),
      ),
      collectors: sort(
        people
          .filter((p) => p.role === StaffRole.collector)
          .map((p) => ({
            ...person(p),
            issues: collectorIssues(
              this.staffCandidate(p),
              trip,
              collectorTrips.get(p.id) ?? [],
              limits.gap,
            ),
          })),
      ),
    };
  }

  /**
   * Cambia la unidad, el conductor o el cobrador (null = quitar). Solo se validan los que
   * cambian. Los límites de horas solo los puede forzar un admin con motivo.
   */
  async assign(id: string, dto: AssignTripDto, actor: AuthUser) {
    const row = await this.trip(id);
    if (!(ASSIGNABLE_STATUSES as readonly string[]).includes(row.status))
      throw new BadRequestException(
        'Solo se puede cambiar la asignación antes de que el recorrido salga',
      );
    const trip = toWindow(row);
    const next = {
      busId: dto.busId === undefined ? row.busId : dto.busId,
      driverId: dto.driverId === undefined ? row.driverId : dto.driverId,
      collectorId:
        dto.collectorId === undefined ? row.collectorId : dto.collectorId,
    };
    if (next.collectorId && next.collectorId === next.driverId)
      throw new BadRequestException(
        'El conductor y el cobrador deben ser personas distintas',
      );

    const [nearby, limits] = await Promise.all([
      this.nearby(row),
      this.limits(),
    ]);
    const issues: Issue[] = [];
    if (next.busId && next.busId !== row.busId) {
      const [b] = await this.buses([next.busId]);
      if (!b) throw new NotFoundException('Unidad no encontrada');
      issues.push(
        ...busIssues(
          {
            status: b.status,
            terminalId: b.terminalId,
            terminalCode: b.terminal.code,
            terminalLocated: b.terminal.latitude !== null,
            seats: b._count.seats,
            documents: b.documents,
          },
          trip,
          by(nearby, 'busId').get(b.id) ?? [],
          limits.turnaround,
        ),
      );
    }
    for (const [key, role] of [
      ['driverId', StaffRole.driver],
      ['collectorId', StaffRole.collector],
    ] as const) {
      const staffId = next[key];
      if (!staffId || staffId === row[key]) continue;
      const [p] = await this.staff(row.tripDate, [role], [staffId]);
      if (!p) throw new NotFoundException('Empleado no encontrado');
      const own = by(nearby, key).get(p.id) ?? [];
      issues.push(
        ...(role === StaffRole.driver
          ? driverIssues(
              this.staffCandidate(p),
              trip,
              own,
              limits.gap,
              limits.maxShift,
            )
          : collectorIssues(this.staffCandidate(p), trip, own, limits.gap)),
      );
    }

    const overrideReason = dto.overrideReason?.trim() || null;
    if (!assignable(issues, actor.role === UserRole.admin, overrideReason)) {
      const blocking = issues.filter((i) => i.level !== 'warn');
      const message = blocking.map((i) => i.message).join('. ');
      throw new BadRequestException(
        blocking.some((i) => i.level === 'block') ||
          actor.role === UserRole.admin
          ? message
          : `${message}. Solo un administrador puede forzarlo con un motivo`,
      );
    }

    const forced = issues.some((i) => i.level === 'override');
    try {
      const updated = await this.prisma.trip.update({
        where: { id },
        data: {
          ...next,
          // El motivo se queda mientras siga el conductor que se forzó (solo las horas de manejo se fuerzan)
          overrideReason: forced
            ? overrideReason
            : next.driverId === row.driverId
              ? row.overrideReason
              : null,
        },
      });
      await this.audit.log({
        userId: actor.id,
        tableName: 'trips',
        recordId: id,
        actionType: ActionType.update,
        oldValues: {
          busId: row.busId,
          driverId: row.driverId,
          collectorId: row.collectorId,
        },
        newValues: { ...next, overrideReason: updated.overrideReason },
      });
      return { warnings: issues.filter((i) => i.level === 'warn') };
    } catch (err) {
      // Otra asignación ganó la carrera: la restricción de la base no deja encimar recorridos
      if (err instanceof Error && err.message.includes('no_overlap'))
        throw new ConflictException(
          'Otro recorrido acaba de tomar esa unidad o persona en ese horario; vuelve a cargar las opciones',
        );
      throw err;
    }
  }

  /** Recorridos sin unidad o sin conductor que salen antes de `until`. */
  unassignedBefore(until: Date) {
    return this.prisma.trip.findMany({
      where: {
        status: TripStatus.scheduled,
        departureAt: { gt: new Date(), lte: until },
        OR: [{ busId: null }, { driverId: null }],
      },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
        busId: true,
        driverId: true,
        route: {
          select: {
            name: true,
            originTerminal: {
              select: { city: { select: { timezone: true } } },
            },
          },
        },
      },
      orderBy: { departureAt: 'asc' },
    });
  }

  /** Recorridos próximos con una unidad que ya no puede salir (mantenimiento o fuera de servicio). */
  busesNoLongerFit() {
    return this.prisma.trip.findMany({
      where: {
        status: { in: [TripStatus.scheduled, TripStatus.boarding] },
        departureAt: { gt: new Date() },
        bus: { status: { in: ['maintenance', 'out_of_service'] } },
      },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
        bus: { select: { economicNumber: true, status: true } },
        route: {
          select: {
            name: true,
            originTerminal: {
              select: { city: { select: { timezone: true } } },
            },
          },
        },
      },
      orderBy: { departureAt: 'asc' },
    });
  }
}
