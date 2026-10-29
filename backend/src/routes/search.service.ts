import { Injectable } from '@nestjs/common';
import { dateKey, toDate } from '../common/dates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchDeparturesDto } from './dto/search.dto.js';
import { timeKey } from './schedule-rules.js';
import {
  legOf,
  searchDepartures,
  type SearchPoint,
  type SearchRoute,
} from './search-rules.js';

const terminal = {
  select: {
    id: true,
    code: true,
    name: true,
    city: { select: { id: true, name: true, timezone: true } },
  },
} as const;

type TerminalRow = {
  id: string;
  code: string;
  name: string;
  city: { id: string; name: string; timezone: string };
};

const point = (
  t: TerminalRow,
  minutes: number,
  priceFromOrigin: number,
): SearchPoint => ({
  terminalId: t.id,
  code: t.code,
  name: t.name,
  cityId: t.city.id,
  cityName: t.city.name,
  timezone: t.city.timezone,
  minutes,
  priceFromOrigin,
});

/** Consulta de salidas para taquilla: rutas directas y tramos con hora local y precio vigente. */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rutas activas con su itinerario completo y horarios activos. */
  private async activeRoutes(): Promise<SearchRoute[]> {
    const rows = await this.prisma.route.findMany({
      where: { isActive: true },
      include: {
        originTerminal: terminal,
        destinationTerminal: terminal,
        stops: { orderBy: { stopOrder: 'asc' }, include: { terminal } },
        schedules: { where: { isActive: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      points: [
        point(r.originTerminal, 0, 0),
        ...r.stops.map((s) =>
          point(
            s.terminal,
            s.durationFromOriginMinutes,
            Number(s.priceFromOrigin),
          ),
        ),
        point(
          r.destinationTerminal,
          r.estimatedDurationMinutes,
          Number(r.basePrice),
        ),
      ],
      schedules: r.schedules.map((s) => ({
        id: s.id,
        departureTime: timeKey(s.departureTime),
        daysOfWeek: s.daysOfWeek,
        validFrom: dateKey(s.validFrom),
        validUntil: s.validUntil ? dateKey(s.validUntil) : null,
        isActive: s.isActive,
      })),
    }));
  }

  /** Ciudades que aparecen en rutas activas (origen, parada o destino), para los selectores. */
  async cities() {
    const routes = await this.activeRoutes();
    const map = new Map<string, { id: string; name: string }>();
    for (const r of routes)
      for (const p of r.points)
        map.set(p.cityId, { id: p.cityId, name: p.cityName });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async search(q: SearchDeparturesDto) {
    const routes = await this.activeRoutes();
    // Temporadas que pueden tocar la fecha de salida de la ruta (hasta 4 días antes del abordaje)
    const from = new Date(toDate(q.date).getTime() - 4 * 86_400_000);
    const seasons = await this.prisma.season.findMany({
      where: {
        isActive: true,
        validUntil: { gte: from },
        validFrom: { lte: toDate(q.date) },
      },
    });
    const query = { ...q, now: new Date() };
    const results = searchDepartures(
      routes,
      seasons.map((s) => ({
        name: s.name,
        seasonType: s.seasonType,
        validFrom: dateKey(s.validFrom),
        validUntil: dateKey(s.validUntil),
        priceModifierPercent: Number(s.priceModifierPercent),
        isActive: s.isActive,
      })),
      query,
    );
    // Para explicar un resultado vacío: ¿hay rutas entre esas ciudades aunque no salgan ese día?
    const connecting = routes.filter((r) => legOf(r.points, query)).length;
    return { results, connectingRoutes: connecting };
  }
}
