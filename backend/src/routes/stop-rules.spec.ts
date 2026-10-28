import { describe, expect, it } from 'vitest';
import { checkItinerary, segmentPrice, type StopInput } from './stop-rules.js';

const route = {
  originTerminalId: 'GDL',
  destinationTerminalId: 'CDMX',
  estimatedDurationMinutes: 420,
  basePrice: 820,
};
const leo: StopInput = {
  terminalId: 'LEO',
  legKm: 220,
  durationFromOriginMinutes: 200,
  priceFromOrigin: 390,
};
const qro: StopInput = {
  terminalId: 'QRO',
  legKm: 190.5,
  durationFromOriginMinutes: 330,
  priceFromOrigin: 620,
};

describe('checkItinerary', () => {
  it('acumula los km y suma el último tramo', () => {
    const r = checkItinerary(route, [leo, qro], 215);
    expect(r.errors).toEqual([]);
    expect(r.kmFromOrigin).toEqual([220, 410.5]);
    expect(r.totalKm).toBe(625.5);
  });

  it('sin paradas, el total es el tramo directo o null', () => {
    expect(checkItinerary(route, [], 540).totalKm).toBe(540);
    const r = checkItinerary(route, [], null);
    expect(r.errors).toEqual([]);
    expect(r.totalKm).toBeNull();
  });

  it('exige el último tramo cuando hay paradas', () => {
    expect(checkItinerary(route, [leo], null).errors.join()).toMatch(
      /último tramo/,
    );
  });

  it('rechaza origen o destino como parada y terminales repetidas', () => {
    const e = checkItinerary(
      route,
      [{ ...leo, terminalId: 'GDL' }, leo, { ...qro, terminalId: 'LEO' }],
      100,
    ).errors.join('|');
    expect(e).toMatch(/Parada 1: no puede ser el origen/);
    expect(e).toMatch(/Parada 3: la terminal ya está/);
  });

  it('tiempos crecientes y menores que la duración total', () => {
    const e = checkItinerary(
      route,
      [qro, { ...leo, durationFromOriginMinutes: 300 }],
      10,
    ).errors.join('|');
    expect(e).toMatch(/Parada 2: debe llegar después/);
    const e2 = checkItinerary(
      route,
      [{ ...leo, durationFromOriginMinutes: 420 }],
      10,
    ).errors.join('|');
    expect(e2).toMatch(/Parada 1: debe llegar antes que el destino/);
  });

  it('precios crecientes y menores que el precio base', () => {
    const e = checkItinerary(
      route,
      [
        qro,
        {
          ...leo,
          terminalId: 'X',
          durationFromOriginMinutes: 400,
          priceFromOrigin: 900,
        },
      ],
      10,
    ).errors.join('|');
    expect(e).toMatch(/Parada 2: el precio debe ser menor que el precio base/);
    const e2 = checkItinerary(
      route,
      [qro, { ...leo, durationFromOriginMinutes: 400 }],
      10,
    ).errors.join('|');
    expect(e2).toMatch(/mayor que el de la parada anterior/);
  });

  it('km del tramo positivos', () => {
    expect(
      checkItinerary(route, [{ ...leo, legKm: 0 }], 10).errors.join(),
    ).toMatch(/km del tramo/);
  });
});

describe('segmentPrice', () => {
  it('es la diferencia entre el precio al bajar y al subir', () => {
    expect(segmentPrice(390, 620)).toBe(230);
    expect(segmentPrice(0, 820)).toBe(820);
  });
});
