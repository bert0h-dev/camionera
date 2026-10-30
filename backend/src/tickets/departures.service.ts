import { Injectable } from '@nestjs/common';
import { toDate } from '../common/dates.js';
import { TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchDeparturesDto } from '../routes/dto/search.dto.js';
import { SearchService } from '../routes/search.service.js';
import { AvailabilityService } from './availability.service.js';
import { sellableError } from './hold-rules.js';

/** Búsqueda de salidas del M4.5 con el recorrido generado y los lugares libres del tramo. */
@Injectable()
export class DeparturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly availability: AvailabilityService,
  ) {}

  async departures(q: SearchDeparturesDto) {
    const { results, connectingRoutes } = await this.search.search(q);
    const trips = results.length
      ? await this.prisma.trip.findMany({
          where: {
            OR: results.map((r) => ({
              routeScheduleId: r.scheduleId,
              tripDate: toDate(r.tripDate),
            })),
          },
          select: {
            id: true,
            tripNumber: true,
            routeScheduleId: true,
            tripDate: true,
            status: true,
            busId: true,
            actualDepartureAt: true,
          },
        })
      : [];
    const tripOf = (r: (typeof results)[number]) =>
      trips.find(
        (t) =>
          t.routeScheduleId === r.scheduleId &&
          t.tripDate.toISOString().slice(0, 10) === r.tripDate &&
          t.status !== TripStatus.cancelled,
      );
    const free = await this.availability.freeCounts(
      results.flatMap((r) => {
        const t = tripOf(r);
        return t
          ? [{ tripId: t.id, board: r.boardIndex, alight: r.alightIndex }]
          : [];
      }),
    );
    const now = new Date();

    return {
      connectingRoutes,
      results: results.map((r) => {
        const t = tripOf(r);
        const reason = t
          ? sellableError(
              {
                status: t.status,
                hasBus: !!t.busId,
                departed: !!t.actualDepartureAt,
              },
              new Date(r.board.at),
              now,
            )
          : 'El recorrido aún no se genera';
        return {
          ...r,
          trip: t
            ? { id: t.id, tripNumber: t.tripNumber, status: t.status }
            : null,
          sellable: !reason,
          notSellableReason: reason,
          freeSeats: t
            ? (free.get(`${t.id}:${r.boardIndex}:${r.alightIndex}`) ?? null)
            : null,
        };
      }),
    };
  }
}
