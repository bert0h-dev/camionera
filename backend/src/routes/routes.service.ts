import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { CatalogsService } from '../fleet/catalogs.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateRouteDto,
  QueryRoutesDto,
  UpdateRouteDto,
} from './dto/route.dto.js';
import { ReplaceStopsDto } from './dto/stop.dto.js';
import { routeError } from './route-rules.js';
import { checkItinerary } from './stop-rules.js';
import {
  currentSchedulesWhere,
  SchedulesService,
} from './schedules.service.js';

const TABLE = 'routes';

const terminal = {
  select: {
    id: true,
    code: true,
    name: true,
    latitude: true,
    longitude: true,
    isActive: true,
    city: { select: { id: true, name: true, state: true, timezone: true } },
  },
} satisfies Prisma.TerminalDefaultArgs;

/** Los horarios cuentan solo si están vigentes hoy. */
const listInclude = () =>
  ({
    originTerminal: terminal,
    destinationTerminal: terminal,
    _count: {
      select: { stops: true, schedules: { where: currentSchedulesWhere() } },
    },
  }) satisfies Prisma.RouteInclude;

const detailInclude = {
  originTerminal: terminal,
  destinationTerminal: terminal,
  stops: { include: { terminal }, orderBy: { stopOrder: 'asc' } },
  schedules: { orderBy: { departureTime: 'asc' } },
} satisfies Prisma.RouteInclude;

const contains = (t: string) => ({
  contains: t,
  mode: Prisma.QueryMode.insensitive,
});

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalogs: CatalogsService,
    private readonly schedules: SchedulesService,
  ) {}

  async findAll(q: QueryRoutesDto) {
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const status = q.status ?? 'active';
    const where: Prisma.RouteWhereInput = {
      isActive: status === 'all' ? undefined : status === 'active',
      originTerminal: q.originCityId ? { cityId: q.originCityId } : undefined,
      destinationTerminal: q.destinationCityId
        ? { cityId: q.destinationCityId }
        : undefined,
      AND: terms.map((t) => ({
        OR: [
          { code: contains(t) },
          { name: contains(t) },
          { originTerminal: { city: { name: contains(t) } } },
          { destinationTerminal: { city: { name: contains(t) } } },
        ],
      })),
    };
    const [data, total] = await Promise.all([
      this.prisma.route.findMany({
        where,
        include: listInclude(),
        orderBy: { [q.sort ?? 'code']: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.route.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  /** Cifras para la banda de la pantalla de rutas. */
  async summary() {
    const [active, inactive, agg, ends, weeklyDepartures] = await Promise.all([
      this.prisma.route.count({ where: { isActive: true } }),
      this.prisma.route.count({ where: { isActive: false } }),
      this.prisma.route.aggregate({
        where: { isActive: true },
        _sum: { distanceKm: true },
        _avg: { basePrice: true },
      }),
      this.prisma.route.findMany({
        where: { isActive: true },
        select: {
          originTerminal: { select: { cityId: true } },
          destinationTerminal: { select: { cityId: true } },
        },
      }),
      this.schedules.weeklyDepartures(),
    ]);
    const cities = new Set(
      ends.flatMap((r) => [
        r.originTerminal.cityId,
        r.destinationTerminal.cityId,
      ]),
    );
    return {
      active,
      inactive,
      totalKm: Number(agg._sum.distanceKm ?? 0),
      averagePrice:
        agg._avg.basePrice === null ? null : Number(agg._avg.basePrice),
      cities: cities.size,
      weeklyDepartures,
    };
  }

  /** Terminales que se pueden usar como origen o destino (activas y con ubicación). */
  formOptions() {
    return this.catalogs.terminals(false, true);
  }

  findOne(id: string) {
    return this.prisma.route.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
  }

  private async check(
    origin: string,
    destination: string,
    checkOrigin: boolean,
    checkDestination: boolean,
  ) {
    const err = routeError({
      originTerminalId: origin,
      destinationTerminalId: destination,
    });
    if (err) throw new BadRequestException(err);
    if (checkOrigin) await this.catalogs.assertUsableTerminal(origin);
    if (checkDestination) await this.catalogs.assertUsableTerminal(destination);
  }

  async create(dto: CreateRouteDto, actor: AuthUser) {
    await this.check(
      dto.originTerminalId,
      dto.destinationTerminalId,
      true,
      true,
    );
    const row = await this.prisma.route.create({ data: dto });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: row.id,
      actionType: ActionType.insert,
      oldValues: null,
      newValues: row,
    });
    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateRouteDto, actor: AuthUser) {
    const before = await this.prisma.route.findUniqueOrThrow({
      where: { id },
    });
    const origin = dto.originTerminalId ?? before.originTerminalId;
    const destination =
      dto.destinationTerminalId ?? before.destinationTerminalId;
    // Al reactivar se vuelve a exigir que ambas terminales sigan siendo utilizables
    const reactivating = dto.isActive === true && !before.isActive;
    await this.check(
      origin,
      destination,
      reactivating || origin !== before.originTerminalId,
      reactivating || destination !== before.destinationTerminalId,
    );
    const stops = await this.prisma.routeStop.findMany({
      where: { routeId: id },
      orderBy: { stopOrder: 'asc' },
    });
    if (
      stops.some((s) => s.terminalId === origin || s.terminalId === destination)
    )
      throw new BadRequestException(
        'Esa terminal ya es una parada de la ruta; quítala de las paradas primero',
      );
    if (stops.length) {
      if (
        dto.distanceKm !== undefined &&
        Number(dto.distanceKm) !== Number(before.distanceKm)
      )
        throw new BadRequestException(
          'La ruta tiene paradas: la distancia se calcula con los km de cada tramo',
        );
      // Las paradas deben seguir llegando antes y costando menos que el destino
      const duration =
        dto.estimatedDurationMinutes ?? before.estimatedDurationMinutes;
      const price = dto.basePrice ?? Number(before.basePrice);
      const last = stops[stops.length - 1];
      if (last.durationFromOriginMinutes >= duration)
        throw new BadRequestException(
          `La duración debe ser mayor que el tiempo a la última parada (${last.durationFromOriginMinutes} min)`,
        );
      if (Number(last.priceFromOrigin) >= price)
        throw new BadRequestException(
          `El precio base debe ser mayor que el de la última parada (${Number(last.priceFromOrigin)})`,
        );
      if (reactivating)
        for (const s of stops)
          await this.catalogs.assertUsableTerminal(s.terminalId);
    }
    const row = await this.prisma.route.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    return this.findOne(id);
  }

  /**
   * Reemplaza el itinerario completo en una transacción: paradas en orden con sus km
   * acumulados, y la distancia de la ruta como la suma de los tramos.
   */
  async replaceStops(id: string, dto: ReplaceStopsDto, actor: AuthUser) {
    const route = await this.prisma.route.findUniqueOrThrow({
      where: { id },
      include: { stops: { orderBy: { stopOrder: 'asc' } } },
    });
    const finalLegKm = dto.finalLegKm ?? null;
    const result = checkItinerary(
      {
        originTerminalId: route.originTerminalId,
        destinationTerminalId: route.destinationTerminalId,
        estimatedDurationMinutes: route.estimatedDurationMinutes,
        basePrice: Number(route.basePrice),
      },
      dto.stops,
      finalLegKm,
    );
    if (result.errors.length) throw new BadRequestException(result.errors);
    // Solo las terminales nuevas en el itinerario deben estar activas y con ubicación
    const current = new Set(route.stops.map((s) => s.terminalId));
    for (const s of dto.stops)
      if (!current.has(s.terminalId))
        await this.catalogs.assertUsableTerminal(s.terminalId);

    await this.prisma.$transaction([
      this.prisma.routeStop.deleteMany({ where: { routeId: id } }),
      this.prisma.routeStop.createMany({
        data: dto.stops.map((s, i) => ({
          routeId: id,
          terminalId: s.terminalId,
          stopOrder: i + 1,
          durationFromOriginMinutes: s.durationFromOriginMinutes,
          kmFromOrigin: result.kmFromOrigin[i],
          priceFromOrigin: s.priceFromOrigin,
        })),
      }),
      this.prisma.route.update({
        where: { id },
        data: { distanceKm: result.totalKm },
      }),
    ]);
    const { stops: before, ...rest } = route;
    await this.audit.log({
      userId: actor.id,
      tableName: 'route_stops',
      recordId: id,
      actionType: ActionType.update,
      oldValues: { stops: before, distanceKm: rest.distanceKm },
      newValues: { stops: dto.stops, distanceKm: result.totalKm },
    });
    return this.findOne(id);
  }
}
