import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { AuthUser } from '../auth/auth.types.js';
import { businessTimezone } from '../common/dates.js';
import {
  TicketEventType,
  TicketStatus,
  TripStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TripStatusService } from '../trips/trip-status.service.js';
import { AvailabilityService } from './availability.service.js';
import {
  checkInError,
  noShows,
  undoError,
  type BoardingPolicy,
} from './boarding-rules.js';
import { manifestPdf } from './manifest-pdf.js';
import { SaleService } from './sale.service.js';

/** Abordan: el cobrador o conductor del recorrido (solo los suyos) y coordinación o supervisión. */
const CREW: UserRole[] = [UserRole.driver, UserRole.collector];

const ticketSelect = {
  id: true,
  ticketNumber: true,
  tripId: true,
  seatNumber: true,
  boardIndex: true,
  alightIndex: true,
  boardAt: true,
  status: true,
  passengerName: true,
  passengerDocument: true,
  checkedInAt: true,
  passengerType: { select: { name: true, requiresId: true } },
  checkedInBy: { select: { fullName: true } },
  boardTerminal: { select: { code: true, name: true } },
  alightTerminal: { select: { code: true, name: true } },
} as const;

/** Check-in con QR o folio, manifiesto de pasajeros y no presentados. */
@Injectable()
export class BoardingService implements OnModuleInit {
  private readonly logger = new Logger(BoardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly availability: AvailabilityService,
    private readonly sale: SaleService,
    private readonly tripStatus: TripStatusService,
  ) {}

  onModuleInit() {
    // Al salir del origen y al terminar se marcan los que no abordaron
    this.tripStatus.onStatusChanged(async (tripId, to) => {
      if (to === TripStatus.in_transit || to === TripStatus.completed)
        await this.markNoShows(tripId);
    });
  }

  private async policy(): Promise<BoardingPolicy> {
    const [checkinMinutes, graceMinutes] = await Promise.all([
      this.settings.get('tickets.checkin_minutes'),
      this.settings.get('tickets.no_show_grace_minutes'),
    ]);
    return { checkinMinutes, graceMinutes };
  }

  /** Trae el recorrido y revisa que quien aborda pueda hacerlo. */
  private async tripFor(tripId: string, user: AuthUser) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        status: true,
        actualDepartureAt: true,
        driver: { select: { userId: true } },
        collector: { select: { userId: true } },
      },
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    if (
      CREW.includes(user.role) &&
      trip.driver?.userId !== user.id &&
      trip.collector?.userId !== user.id
    )
      throw new ForbiddenException(
        'Solo puedes abordar pasajeros de tus recorridos',
      );
    return trip;
  }

  /** Busca el boleto por QR (firma verificada) o por folio. */
  private async ticketByCode(code: string) {
    const c = code.trim();
    const id = this.sale.ticketOfQr(c);
    const ticket = await this.prisma.ticket.findFirst({
      where: id ? { id } : { ticketNumber: { equals: c, mode: 'insensitive' } },
      select: {
        ...ticketSelect,
        trip: { select: { tripNumber: true, departureAt: true } },
      },
    });
    if (!ticket)
      throw new NotFoundException(
        c.startsWith('CC1.')
          ? 'El código QR no es válido (no lo emitió la central)'
          : 'No hay un boleto con ese folio',
      );
    return ticket;
  }

  async checkIn(tripId: string, code: string, user: AuthUser) {
    const [trip, ticket, policy] = await Promise.all([
      this.tripFor(tripId, user),
      this.ticketByCode(code),
      this.policy(),
    ]);
    if (ticket.tripId !== tripId)
      throw new BadRequestException(
        `Este boleto es de otro recorrido (${ticket.trip.tripNumber}); no puede abordar aquí`,
      );
    const now = new Date();
    const err = checkInError(ticket, trip, policy, now);
    if (err) {
      if (ticket.status === TicketStatus.checked_in && ticket.checkedInAt)
        throw new BadRequestException(
          `${err} (${new Intl.DateTimeFormat('es-MX', { timeZone: businessTimezone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ticket.checkedInAt)}${ticket.checkedInBy ? `, ${ticket.checkedInBy.fullName}` : ''})`,
        );
      throw new BadRequestException(err);
    }
    // Solo si sigue confirmado: dos lecturas del mismo QR a la vez no abordan dos veces
    const updated = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.confirmed },
      data: {
        status: TicketStatus.checked_in,
        checkedInAt: now,
        checkedInById: user.id,
      },
    });
    if (updated.count !== 1)
      throw new BadRequestException('Este pasajero ya abordó');
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        type: TicketEventType.checked_in,
        userId: user.id,
      },
    });
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      seatNumber: ticket.seatNumber,
      passengerName: ticket.passengerName,
      passengerType: ticket.passengerType.name,
      passengerDocument: ticket.passengerDocument,
      // La credencial solo se avisa: la decide quien aborda (decisión 6.5)
      verifyId: ticket.passengerType.requiresId,
      board: ticket.boardTerminal,
      alight: ticket.alightTerminal,
    };
  }

  async undo(ticketId: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: ticketSelect,
    });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    const [trip, policy] = await Promise.all([
      this.tripFor(ticket.tripId, user),
      this.policy(),
    ]);
    const err = undoError(ticket, trip, policy, new Date());
    if (err) throw new BadRequestException(err);
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.confirmed,
        checkedInAt: null,
        checkedInById: null,
      },
    });
    await this.prisma.ticketEvent.create({
      data: {
        ticketId,
        type: TicketEventType.confirmed,
        userId: user.id,
        detail: { undoCheckIn: true },
      },
    });
    return { ok: true };
  }

  /** Manifiesto: pasajeros por parada de subida con su estado y los conteos del recorrido. */
  async manifest(tripId: string, user: AuthUser) {
    await this.tripFor(tripId, user);
    const trip = await this.availability.loadTrip(tripId);
    const extra = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        actualDepartureAt: true,
        driver: { select: { firstName: true, lastName: true } },
        collector: { select: { firstName: true, lastName: true } },
      },
    });
    const points = this.availability.itinerary(trip);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tripId,
        status: {
          in: [
            TicketStatus.confirmed,
            TicketStatus.checked_in,
            TicketStatus.no_show,
          ],
        },
      },
      select: ticketSelect,
      orderBy: [{ boardIndex: 'asc' }, { seatNumber: 'asc' }],
    });
    const policy = await this.policy();
    const now = new Date();
    const stops = points
      .slice(0, -1)
      .map((p) => {
        const list = tickets.filter((t) => t.boardIndex === p.index);
        return {
          index: p.index,
          code: p.code,
          name: p.name,
          cityName: p.cityName,
          timezone: p.timezone,
          at: p.at,
          // Abierta: dentro de la ventana de check-in y sin que el recorrido haya pasado la parada
          open: list.length
            ? list.some(
                (t) =>
                  !checkInError(
                    { ...t, status: TicketStatus.confirmed },
                    {
                      status: trip.status,
                      actualDepartureAt: extra.actualDepartureAt,
                    },
                    policy,
                    now,
                  ),
              )
            : false,
          expected: list.length,
          boarded: list.filter((t) => t.status === TicketStatus.checked_in)
            .length,
          passengers: list,
        };
      })
      .filter((s) => s.expected > 0);
    const person = (p: { firstName: string; lastName: string } | null) =>
      p ? `${p.firstName} ${p.lastName}` : null;
    return {
      trip: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: trip.status,
        departureAt: trip.departureAt,
        actualDepartureAt: extra.actualDepartureAt,
        route: { code: trip.route.code, name: trip.route.name },
        bus: trip.bus?.economicNumber ?? null,
        platform: trip.platform?.code ?? null,
        driver: person(extra.driver),
        collector: person(extra.collector),
        origin: points[0],
        destination: points[points.length - 1],
      },
      totals: {
        expected: tickets.length,
        boarded: tickets.filter((t) => t.status === TicketStatus.checked_in)
          .length,
        noShow: tickets.filter((t) => t.status === TicketStatus.no_show).length,
      },
      checkinMinutes: policy.checkinMinutes,
      stops,
    };
  }

  async manifestPdf(tripId: string, user: AuthUser) {
    const m = await this.manifest(tripId, user);
    const company = String(
      (await this.settings.get('company.trade_name')) || 'Central Camionera',
    );
    return {
      buffer: await manifestPdf(m, company),
      fileName: `manifiesto-${m.trip.tripNumber}.pdf`,
    };
  }

  // ---------- No presentados ----------

  /** Marca no presentados del recorrido (origen al salir, intermedias tras la gracia, todo al terminar). */
  async markNoShows(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true, actualDepartureAt: true },
    });
    if (!trip) return 0;
    const tickets = await this.prisma.ticket.findMany({
      where: { tripId, status: TicketStatus.confirmed },
      select: { id: true, status: true, boardIndex: true, boardAt: true },
    });
    const due = noShows(tickets, trip, await this.policy(), new Date());
    if (!due.length) return 0;
    const ids = due.map((t) => t.id);
    await this.prisma.$transaction([
      this.prisma.ticket.updateMany({
        where: { id: { in: ids }, status: TicketStatus.confirmed },
        data: { status: TicketStatus.no_show },
      }),
      this.prisma.ticketEvent.createMany({
        data: ids.map((ticketId) => ({
          ticketId,
          type: TicketEventType.no_show,
        })),
      }),
    ]);
    return ids.length;
  }

  /** Cada 5 min: no presentados de paradas intermedias en recorridos en camino. */
  @Cron('*/5 * * * *', { name: 'tickets-no-shows' })
  async markIntermediateNoShows() {
    try {
      const trips = await this.prisma.trip.findMany({
        where: {
          status: { in: [TripStatus.in_transit, TripStatus.delayed] },
          actualDepartureAt: { not: null },
          tickets: { some: { status: TicketStatus.confirmed } },
        },
        select: { id: true },
      });
      let n = 0;
      for (const t of trips) n += await this.markNoShows(t.id);
      if (n) this.logger.log(`No presentados marcados: ${n}`);
    } catch (err) {
      this.logger.error('No se pudieron marcar los no presentados', err);
    }
  }
}
