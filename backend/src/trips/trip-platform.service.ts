import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ActionType, TripStatus, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wallTime } from '../routes/route-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import { ASSIGNABLE_STATUSES, assignable } from './assignment-rules.js';
import { SetTripPlatformDto } from './dto/trip.dto.js';
import { platformConflicts, platformIssues } from './platform-rules.js';
import { TRIP_STATUS_LABELS } from './trip-rules.js';

const MIN = 60_000;
/** Tablero: desde 15 min atrás hasta 6 h adelante, máximo 30 salidas */
const BOARD_PAST = 15 * MIN;
const BOARD_AHEAD = 6 * 60 * MIN;
const BOARD_MAX = 30;

/** Andén de salida de los recorridos y tablero de salidas por terminal. */
@Injectable()
export class TripPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private async trip(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        tripNumber: true,
        status: true,
        departureAt: true,
        actualDepartureAt: true,
        platformId: true,
        platformOverrideReason: true,
        route: { select: { originTerminalId: true } },
      },
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    return trip;
  }

  /** Recorridos no cancelados con andén cuya ventana puede encimarse con la de `departureAt`. */
  private async neighbours(
    terminalId: string,
    departureAt: Date,
    minutes: number,
  ) {
    const margin = minutes * MIN;
    const rows = await this.prisma.trip.findMany({
      where: {
        status: { not: TripStatus.cancelled },
        platform: { terminalId },
        departureAt: {
          gte: new Date(departureAt.getTime() - margin),
          lte: new Date(departureAt.getTime() + margin),
        },
      },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
        platformId: true,
      },
    });
    return rows;
  }

  /** Andenes de la terminal de origen con los recorridos que los ocupan en la ventana del viaje. */
  async options(id: string) {
    const trip = await this.trip(id);
    const minutes = await this.settings.get('trips.platform_boarding_minutes');
    const [platforms, others] = await Promise.all([
      this.prisma.platform.findMany({
        where: { terminalId: trip.route.originTerminalId },
        orderBy: { code: 'asc' },
      }),
      this.neighbours(trip.route.originTerminalId, trip.departureAt, minutes),
    ]);
    return {
      boardingMinutes: minutes,
      platformId: trip.platformId,
      platforms: platforms
        .filter((p) => p.isActive || p.id === trip.platformId)
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          isActive: p.isActive,
          conflicts: platformConflicts(trip, p.id, others, minutes).map(
            (c) => ({
              id: c.id,
              tripNumber: c.tripNumber,
              departureAt: c.departureAt,
            }),
          ),
        })),
    };
  }

  /** Pone o quita el andén. Encimarse con otro recorrido solo lo fuerza un admin con motivo. */
  async set(id: string, dto: SetTripPlatformDto, actor: AuthUser) {
    const trip = await this.trip(id);
    if (
      !(ASSIGNABLE_STATUSES as readonly string[]).includes(trip.status) ||
      trip.actualDepartureAt
    )
      throw new BadRequestException(
        'Solo se puede cambiar el andén antes de que el recorrido salga',
      );
    const platformId = dto.platformId ?? null;
    const reason = dto.overrideReason?.trim() || null;
    let forced = false;
    if (platformId) {
      const platform = await this.prisma.platform.findUnique({
        where: { id: platformId },
      });
      if (!platform) throw new NotFoundException('Andén no encontrado');
      const minutes = await this.settings.get(
        'trips.platform_boarding_minutes',
      );
      const others = await this.neighbours(
        platform.terminalId,
        trip.departureAt,
        minutes,
      );
      const issues = platformIssues(
        platform,
        trip.route.originTerminalId,
        platformConflicts(trip, platformId, others, minutes),
      );
      if (!assignable(issues, actor.role === UserRole.admin, reason)) {
        const message = issues.map((i) => i.message).join('. ');
        throw new BadRequestException(
          issues.some((i) => i.level === 'block') ||
            actor.role === UserRole.admin
            ? message
            : `${message}. Solo un administrador puede forzarlo con un motivo`,
        );
      }
      forced = issues.some((i) => i.level === 'override');
    }
    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        platformId,
        platformOverrideReason: forced ? reason : null,
      },
      select: { platformId: true, platformOverrideReason: true },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'trips',
      recordId: id,
      actionType: ActionType.update,
      oldValues: {
        platformId: trip.platformId,
        platformOverrideReason: trip.platformOverrideReason,
      },
      newValues: updated,
    });
    return updated;
  }

  /** Próximas salidas de una terminal para el tablero, con las terminales que se pueden elegir. */
  async board(terminalId?: string) {
    const now = Date.now();
    // Terminales de origen de rutas activas, para el selector del tablero
    const terminals = await this.prisma.terminal.findMany({
      where: { isActive: true, routesAsOrigin: { some: { isActive: true } } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    // Sin terminal (o una que ya no tiene rutas) se muestra la primera
    const id = terminals.some((t) => t.id === terminalId)
      ? terminalId
      : terminals[0]?.id;
    if (!id)
      return {
        terminals,
        terminal: null,
        generatedAt: new Date(now),
        departures: [],
      };
    const terminal = await this.prisma.terminal.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        city: { select: { name: true, timezone: true } },
      },
    });
    if (!terminal) throw new NotFoundException('Terminal no encontrada');
    const rows = await this.prisma.trip.findMany({
      where: {
        route: { originTerminalId: id },
        departureAt: {
          gte: new Date(now - BOARD_PAST),
          lte: new Date(now + BOARD_AHEAD),
        },
      },
      select: {
        id: true,
        tripNumber: true,
        status: true,
        departureAt: true,
        actualDepartureAt: true,
        platform: { select: { id: true, code: true, name: true } },
        bus: { select: { economicNumber: true } },
        route: {
          select: {
            destinationTerminal: {
              select: {
                code: true,
                name: true,
                city: { select: { name: true } },
              },
            },
            stops: {
              select: {
                terminal: { select: { city: { select: { name: true } } } },
              },
              orderBy: { stopOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { departureAt: 'asc' },
      take: BOARD_MAX,
    });
    return {
      terminals,
      terminal,
      generatedAt: new Date(now),
      departures: rows.map((t) => ({
        id: t.id,
        tripNumber: t.tripNumber,
        departureAt: t.departureAt,
        time: wallTime(t.departureAt, terminal.city.timezone).time,
        destination: t.route.destinationTerminal.city.name,
        destinationCode: t.route.destinationTerminal.code,
        stops: t.route.stops.map((s) => s.terminal.city.name),
        platform: t.platform,
        busNumber: t.bus?.economicNumber ?? null,
        status: t.status,
        departed: t.actualDepartureAt !== null,
        statusLabel: t.actualDepartureAt
          ? 'Salió'
          : TRIP_STATUS_LABELS[t.status],
      })),
    };
  }

  /** Recorridos que salen antes de `until` sin andén (para Pendientes). */
  withoutPlatformBefore(until: Date) {
    return this.prisma.trip.findMany({
      where: {
        status: {
          in: [TripStatus.scheduled, TripStatus.boarding, TripStatus.delayed],
        },
        actualDepartureAt: null,
        platformId: null,
        departureAt: { gt: new Date(), lte: until },
        // Solo terminales que ya tienen andenes; las demás no piden andén
        route: {
          originTerminal: { platforms: { some: { isActive: true } } },
        },
      },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
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
