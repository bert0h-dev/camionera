import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toDate } from '../common/dates.js';
import { BusesService } from '../fleet/buses.service.js';
import {
  ActionType,
  BusStatus,
  OdometerSource,
  TripStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ChangeTripStatusDto, MineQueryDto } from './dto/trip.dto.js';
import { DRIVER_TRANSITIONS, transitionError } from './status-rules.js';
import { TRIP_STATUS_LABELS } from './trip-rules.js';
import { listInclude } from './trips.service.js';

/** Minutos de gracia antes de avisar que un recorrido debió salir */
const LATE_DEPARTURE_MIN = 15;
/** Minutos de gracia antes de avisar que un recorrido debió llegar y no se ha cerrado */
const LATE_ARRIVAL_MIN = 60;

/** Ciclo de vida del recorrido: abordar, salir, retrasar, terminar y cancelar. */
@Injectable()
export class TripStatusService {
  private readonly logger = new Logger(TripStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly buses: BusesService,
  ) {}

  /** El conductor solo opera sus propios recorridos y no puede cancelar. */
  private assertCanOperate(
    actor: AuthUser,
    driverUserId: string | null,
    to: TripStatus,
  ) {
    if (actor.role !== UserRole.driver) return;
    if (driverUserId !== actor.id)
      throw new ForbiddenException('Solo puedes operar tus propios recorridos');
    if (!DRIVER_TRANSITIONS.includes(to))
      throw new ForbiddenException(
        'La cancelación la hace coordinación; avísale',
      );
  }

  async change(id: string, dto: ChangeTripStatusDto, actor: AuthUser) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        bus: {
          select: {
            id: true,
            status: true,
            odometerKm: true,
            firstServiceAt: true,
          },
        },
        driver: { select: { userId: true } },
      },
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    const to = dto.status;
    this.assertCanOperate(actor, trip.driver?.userId ?? null, to);

    const now = new Date();
    const departed = trip.actualDepartureAt !== null;
    const error = transitionError(
      {
        status: trip.status,
        departureAt: trip.departureAt,
        departed,
        hasBus: !!trip.busId,
        hasDriver: !!trip.driverId,
      },
      {
        to,
        now,
        boardingOpenMinutes: await this.settings.get(
          'trips.boarding_open_minutes',
        ),
        reason: dto.reason,
        endOdometerKm: dto.endOdometerKm,
      },
    );
    if (error) throw new BadRequestException(error);

    const departing = to === TripStatus.in_transit && !departed;
    const bus = trip.bus;
    // Una unidad que se fue a taller o quedó fuera de servicio no puede abordar ni salir
    if (
      bus &&
      (to === TripStatus.boarding || departing) &&
      (bus.status === BusStatus.maintenance ||
        bus.status === BusStatus.out_of_service)
    )
      throw new BadRequestException(
        'La unidad asignada no está disponible; cambia la asignación',
      );

    // Odómetro: nunca baja (lo valida Flota) y la llegada no puede ser menor que la salida
    if (bus && departing && dto.startOdometerKm != null)
      await this.buses.recordOdometer(
        bus.id,
        dto.startOdometerKm,
        actor,
        OdometerSource.trip,
      );
    if (bus && to === TripStatus.completed) {
      const start = trip.startOdometerKm ?? dto.startOdometerKm ?? null;
      if (start !== null && dto.endOdometerKm! < start)
        throw new BadRequestException(
          `El odómetro de llegada no puede ser menor que el de salida (${start.toLocaleString('es-MX')} km)`,
        );
      await this.buses.recordOdometer(
        bus.id,
        dto.endOdometerKm!,
        actor,
        OdometerSource.trip,
      );
    }

    const reason = dto.reason?.trim() || null;
    const [updated] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id },
        data: {
          status: to,
          ...(departing && {
            actualDepartureAt: now,
            startOdometerKm: dto.startOdometerKm ?? null,
          }),
          ...(to === TripStatus.completed && {
            actualArrivalAt: now,
            endOdometerKm: dto.endOdometerKm,
          }),
          ...(to === TripStatus.cancelled && {
            cancelReason: reason,
            cancelledAt: now,
            cancelledById: actor.id,
          }),
        },
      }),
      this.prisma.tripStatusLog.create({
        data: {
          tripId: id,
          fromStatus: trip.status,
          toStatus: to,
          reason,
          changedById: actor.id,
        },
      }),
      // La unidad sale a servicio al salir y regresa a disponible al terminar
      ...(bus && departing && bus.status === BusStatus.available
        ? [
            this.prisma.bus.update({
              where: { id: bus.id },
              data: {
                status: BusStatus.in_service,
                statusReason: `Recorrido ${trip.tripNumber}`,
                statusChangedAt: now,
                ...(!bus.firstServiceAt && { firstServiceAt: now }),
              },
            }),
          ]
        : []),
      ...(bus &&
      to === TripStatus.completed &&
      bus.status === BusStatus.in_service
        ? [
            this.prisma.bus.update({
              where: { id: bus.id },
              data: {
                status: BusStatus.available,
                statusReason: null,
                statusChangedAt: now,
              },
            }),
          ]
        : []),
    ]);
    await this.audit.log({
      userId: actor.id,
      tableName: 'trips',
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: trip.status },
      newValues: { status: to, reason },
    });
    if (to === TripStatus.cancelled)
      await this.onTripCancelled(id, reason ?? '', actor);
    return {
      id: updated.id,
      status: updated.status,
      message: `Recorrido ${TRIP_STATUS_LABELS[to].toLowerCase()}`,
    };
  }

  /** Manejadores del Módulo 6 al cancelar un recorrido (Boletos se registra al arrancar; así Recorridos no depende de Boletos). */
  private readonly cancelHandlers: ((
    tripId: string,
    reason: string,
    actor: AuthUser,
  ) => Promise<void>)[] = [];

  onCancelled(
    handler: (tripId: string, reason: string, actor: AuthUser) => Promise<void>,
  ) {
    this.cancelHandlers.push(handler);
  }

  /** Cancela los boletos del recorrido; si un manejador falla, el recorrido ya quedó cancelado y solo se registra. */
  private async onTripCancelled(
    tripId: string,
    reason: string,
    actor: AuthUser,
  ) {
    for (const h of this.cancelHandlers)
      await h(tripId, reason, actor).catch((err: unknown) =>
        this.logger.error(
          `No se cancelaron los boletos del recorrido ${tripId}`,
          err,
        ),
      );
  }

  // ---------- Conductor ----------

  /** Recorridos del día del usuario como conductor o cobrador. */
  mine(actor: AuthUser, q: MineQueryDto) {
    const person = { userId: actor.id };
    return this.prisma.trip.findMany({
      where: {
        tripDate: toDate(q.date),
        OR: [{ driver: person }, { collector: person }],
      },
      include: listInclude,
      orderBy: { departureAt: 'asc' },
    });
  }

  /** Un conductor o cobrador solo ve la ficha de sus recorridos. */
  async assertCanView(id: string, actor: AuthUser) {
    if (actor.role !== UserRole.driver && actor.role !== UserRole.collector)
      return;
    const own = await this.prisma.trip.count({
      where: {
        id,
        OR: [
          { driver: { userId: actor.id } },
          { collector: { userId: actor.id } },
        ],
      },
    });
    if (!own) throw new ForbiddenException('Solo puedes ver tus recorridos');
  }

  // ---------- Pendientes ----------

  /** Debieron salir hace más de 15 min y siguen programados o abordando. */
  lateDepartures() {
    return this.prisma.trip.findMany({
      where: {
        status: { in: [TripStatus.scheduled, TripStatus.boarding] },
        departureAt: {
          lt: new Date(Date.now() - LATE_DEPARTURE_MIN * 60_000),
        },
      },
      select: lateSelect,
      orderBy: { departureAt: 'asc' },
    });
  }

  /** Ya salieron, debieron llegar hace más de una hora y nadie los ha terminado. */
  openArrivals() {
    return this.prisma.trip.findMany({
      where: {
        status: { in: [TripStatus.in_transit, TripStatus.delayed] },
        actualDepartureAt: { not: null },
        arrivalAt: { lt: new Date(Date.now() - LATE_ARRIVAL_MIN * 60_000) },
      },
      select: lateSelect,
      orderBy: { arrivalAt: 'asc' },
    });
  }
}

const lateSelect = {
  id: true,
  tripNumber: true,
  departureAt: true,
  arrivalAt: true,
  status: true,
  route: {
    select: {
      name: true,
      originTerminal: { select: { city: { select: { timezone: true } } } },
      destinationTerminal: { select: { city: { select: { timezone: true } } } },
    },
  },
} as const;
