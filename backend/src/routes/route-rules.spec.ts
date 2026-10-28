import { describe, expect, it } from 'vitest';
import {
  localArrival,
  offsetMinutes,
  routeError,
  zonedInstant,
} from './route-rules.js';

describe('routeError', () => {
  it('rechaza origen igual a destino', () => {
    expect(
      routeError({ originTerminalId: 'a', destinationTerminalId: 'a' }),
    ).toMatch(/distintas/);
  });
  it('acepta terminales distintas', () => {
    expect(
      routeError({ originTerminalId: 'a', destinationTerminalId: 'b' }),
    ).toBeNull();
  });
});

describe('zonas horarias', () => {
  it('centro de México es UTC−6 sin horario de verano', () => {
    expect(
      offsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/Mexico_City'),
    ).toBe(-360);
  });

  it('convierte hora local a instante', () => {
    expect(
      zonedInstant('2026-03-10', '08:00', 'America/Mexico_City').toISOString(),
    ).toBe('2026-03-10T14:00:00.000Z');
  });

  it('Hermosillo → Tijuana en verano: misma hora de pared (Tijuana tiene horario de verano)', () => {
    const r = localArrival(
      '2026-07-10',
      '08:00',
      'America/Hermosillo',
      600,
      'America/Tijuana',
    );
    expect(r.time).toBe('18:00');
    expect(r.dayOffset).toBe(0);
  });

  it('Hermosillo → Tijuana en invierno: llega una hora antes en reloj local', () => {
    const r = localArrival(
      '2026-01-10',
      '08:00',
      'America/Hermosillo',
      600,
      'America/Tijuana',
    );
    expect(r.time).toBe('17:00');
  });

  it('CDMX → Cancún gana una hora y puede cambiar de día', () => {
    const r = localArrival(
      '2026-05-01',
      '22:00',
      'America/Mexico_City',
      120,
      'America/Cancun',
    );
    expect(r.time).toBe('01:00');
    expect(r.date).toBe('2026-05-02');
    expect(r.dayOffset).toBe(1);
  });

  it('respeta el cambio de horario de Tijuana el día del cambio', () => {
    // 8 de marzo de 2026: Tijuana adelanta a las 02:00 → 03:00
    expect(
      zonedInstant('2026-03-08', '04:00', 'America/Tijuana').toISOString(),
    ).toBe('2026-03-08T11:00:00.000Z');
    expect(
      zonedInstant('2026-03-08', '01:00', 'America/Tijuana').toISOString(),
    ).toBe('2026-03-08T09:00:00.000Z');
  });
});
