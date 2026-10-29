import { describe, expect, it } from 'vitest';
import { SeasonType } from '../generated/prisma/enums.js';
import {
  searchDepartures,
  type SearchPoint,
  type SearchQuery,
  type SearchRoute,
} from './search-rules.js';

const pt = (
  code: string,
  minutes: number,
  price: number,
  timezone = 'America/Mexico_City',
): SearchPoint => ({
  terminalId: code,
  code,
  name: `Terminal ${code}`,
  cityId: code.toLowerCase(),
  cityName: code,
  timezone,
  minutes,
  priceFromOrigin: price,
});

const schedule = (
  departureTime: string,
  daysOfWeek = [0, 1, 2, 3, 4, 5, 6],
) => ({
  id: `s-${departureTime}`,
  departureTime,
  daysOfWeek,
  validFrom: '2026-01-01',
  validUntil: null,
  isActive: true,
});

// GDL → LEO (200 min, $390) → QRO (330, $620) → CDMX (420, $820)
const gdlCdmx: SearchRoute = {
  id: 'r1',
  code: 'GDL-CDMX',
  name: 'Guadalajara – CDMX',
  points: [
    pt('GDL', 0, 0),
    pt('LEO', 200, 390),
    pt('QRO', 330, 620),
    pt('CDMX', 420, 820),
  ],
  schedules: [schedule('06:00'), schedule('22:30')],
};
const leoQro: SearchRoute = {
  id: 'r2',
  code: 'LEO-QRO',
  name: 'León – Querétaro',
  points: [pt('LEO', 0, 0), pt('QRO', 150, 340)],
  schedules: [schedule('08:00', [1, 2, 3, 4, 5])],
};

// Viernes 13 de noviembre de 2026; "ahora" muy temprano para no descartar salidas
const q = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  originCityId: 'leo',
  destinationCityId: 'qro',
  date: '2026-11-13',
  now: new Date('2026-11-13T00:00:00Z'),
  ...over,
});

describe('searchDepartures', () => {
  it('encuentra rutas directas y tramos dentro de rutas más largas', () => {
    const r = searchDepartures([gdlCdmx, leoQro], [], q());
    expect(r.map((x) => `${x.routeCode} ${x.board.localTime}`)).toEqual([
      'GDL-CDMX 01:50',
      'LEO-QRO 08:00',
      'GDL-CDMX 09:20',
    ]);
    const leg = r[2];
    expect(leg).toMatchObject({
      basePrice: 230,
      price: 230,
      durationMinutes: 130,
      intermediateStops: 0,
    });
    expect(leg.alight.localTime).toBe('11:30');
  });

  it('no sirve en sentido contrario', () => {
    expect(
      searchDepartures(
        [gdlCdmx],
        [],
        q({ originCityId: 'qro', destinationCityId: 'leo' }),
      ),
    ).toEqual([]);
  });

  it('abordar después de medianoche usa la salida del día anterior', () => {
    // 22:30 desde GDL llega a León a las 01:50 del día siguiente
    const r = searchDepartures([gdlCdmx], [], q({ destinationCityId: 'cdmx' }));
    const late = r.find((x) => x.board.localTime === '01:50')!;
    expect(late.tripDate).toBe('2026-11-12');
    expect(late.intermediateStops).toBe(1);
    expect(late.price).toBe(430);
  });

  it('respeta los días de la semana del horario', () => {
    // Sábado: León – Querétaro solo opera entre semana
    const r = searchDepartures([leoQro], [], q({ date: '2026-11-14' }));
    expect(r).toEqual([]);
  });

  it('aplica la temporada de la fecha del viaje y redondea a peso', () => {
    const r = searchDepartures(
      [leoQro],
      [
        {
          name: 'Baja',
          seasonType: SeasonType.low,
          validFrom: '2026-11-01',
          validUntil: '2026-11-30',
          priceModifierPercent: -10,
          isActive: true,
        },
      ],
      q(),
    );
    expect(r[0]).toMatchObject({
      basePrice: 340,
      price: 306,
      season: { name: 'Baja' },
    });
  });

  it('oculta lo que ya salió y aplica filtros', () => {
    const later = q({ now: new Date('2026-11-13T15:00:00Z') }); // 09:00 en el centro
    expect(
      searchDepartures([gdlCdmx, leoQro], [], later).map(
        (x) => x.board.localTime,
      ),
    ).toEqual(['09:20']);
    expect(
      searchDepartures([gdlCdmx, leoQro], [], q({ timeFrom: '09:00' })).length,
    ).toBe(1);
    expect(
      searchDepartures([gdlCdmx, leoQro], [], q({ maxPrice: 200 })),
    ).toEqual([]);
    expect(
      searchDepartures(
        [gdlCdmx],
        [],
        q({ destinationCityId: 'cdmx', directOnly: true }),
      ),
    ).toEqual([]);
    expect(
      searchDepartures([gdlCdmx, leoQro], [], q({ sort: 'price' }))[0]
        .routeCode,
    ).toBe('GDL-CDMX');
  });

  it('muestra la llegada en la hora local del destino', () => {
    const tij: SearchRoute = {
      id: 'r3',
      code: 'HMO-TIJ',
      name: 'Hermosillo – Tijuana',
      points: [
        { ...pt('HMO', 0, 0, 'America/Hermosillo') },
        { ...pt('TIJ', 600, 1150, 'America/Tijuana') },
      ],
      schedules: [schedule('21:00')],
    };
    const r = searchDepartures(
      [tij],
      [],
      q({ originCityId: 'hmo', destinationCityId: 'tij' }),
    );
    expect(r[0].alight.localTime).toBe('06:00');
    expect(r[0].alight.dayOffset).toBe(1);
  });
});
