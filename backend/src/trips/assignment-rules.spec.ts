import { describe, expect, it } from 'vitest';
import {
  assignable,
  busIssues,
  collectorIssues,
  driverIssues,
  overlapping,
  type BusCandidate,
  type StaffCandidate,
  type TripWindow,
} from './assignment-rules.js';

const at = (h: string) => new Date(`2026-11-02T${h}:00Z`);
const trip = (over: Partial<TripWindow> = {}): TripWindow => ({
  id: 't1',
  tripNumber: 'GDL-MEX-261102-0800',
  tripDate: '2026-11-02',
  departureAt: at('14:00'),
  arrivalAt: at('21:00'),
  durationMinutes: 420,
  originTerminalId: 'GDL',
  destinationTerminalId: 'MEX',
  destinationCode: 'MEX',
  ...over,
});

const bus = (over: Partial<BusCandidate> = {}): BusCandidate => ({
  status: 'available',
  terminalId: 'GDL',
  terminalCode: 'GDL',
  terminalLocated: true,
  seats: 40,
  documents: [
    {
      type: 'insurance',
      issueDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-01-01'),
    },
    {
      type: 'circulation_card',
      issueDate: new Date('2026-01-01'),
      expiryDate: null,
    },
  ],
  ...over,
});

const person = (over: Partial<StaffCandidate> = {}): StaffCandidate => ({
  role: 'driver',
  status: 'active',
  licenseExpiries: [new Date('2027-05-01')],
  restDay: false,
  ...over,
});

const levels = (issues: { level: string }[]) => issues.map((i) => i.level);

describe('overlapping', () => {
  const other = trip({
    id: 't2',
    tripNumber: 'OTRO',
    departureAt: at('21:20'),
    arrivalAt: at('23:00'),
  });
  it('cuenta el descanso entre recorridos', () => {
    expect(overlapping(trip(), [other], 0)).toBeUndefined();
    expect(overlapping(trip(), [other], 30)?.id).toBe('t2');
  });
  it('ignora el propio recorrido', () => {
    expect(overlapping(trip(), [trip()], 30)).toBeUndefined();
  });
});

describe('busIssues', () => {
  it('una unidad apta en su terminal no tiene observaciones', () => {
    expect(busIssues(bus(), trip(), [], 30)).toEqual([]);
  });

  it('bloquea en mantenimiento, con seguro vencido a la fecha del viaje o sin asientos', () => {
    expect(
      levels(busIssues(bus({ status: 'maintenance' }), trip(), [], 30)),
    ).toEqual(['block']);
    const expired = bus({
      documents: [
        {
          type: 'insurance',
          issueDate: new Date('2025-01-01'),
          expiryDate: new Date('2026-11-01'),
        },
        {
          type: 'circulation_card',
          issueDate: new Date('2026-01-01'),
          expiryDate: null,
        },
      ],
    });
    expect(busIssues(expired, trip(), [], 30)[0].message).toContain('Seguro');
    expect(levels(busIssues(bus({ seats: 0 }), trip(), [], 30))).toEqual([
      'block',
    ]);
  });

  it('bloquea un recorrido encimado y avisa dónde termina el anterior', () => {
    const before = trip({
      id: 't0',
      tripNumber: 'QRO-GDL',
      departureAt: at('08:00'),
      arrivalAt: at('13:50'),
      destinationTerminalId: 'QRO',
      destinationCode: 'QRO',
    });
    const issues = busIssues(bus(), trip(), [before], 30);
    expect(levels(issues)).toEqual(['block', 'warn']);
    expect(issues[1].message).toContain('QRO');
  });

  it('avisa si su base no es el origen', () => {
    expect(
      busIssues(
        bus({ terminalId: 'LEO', terminalCode: 'LEO' }),
        trip(),
        [],
        30,
      ),
    ).toEqual([{ level: 'warn', message: 'Su terminal base es LEO' }]);
  });
});

describe('driverIssues', () => {
  it('pide rol de conductor, estar activo y licencia vigente a la llegada', () => {
    expect(driverIssues(person(), trip(), [], 30, 14)).toEqual([]);
    expect(
      levels(driverIssues(person({ role: 'collector' }), trip(), [], 30, 14)),
    ).toEqual(['block']);
    expect(
      driverIssues(person({ status: 'vacation' }), trip(), [], 30, 14)[0]
        .message,
    ).toContain('vacaciones');
    expect(
      driverIssues(
        person({ licenseExpiries: [new Date('2026-11-01')] }),
        trip(),
        [],
        30,
        14,
      )[0].message,
    ).toContain('licencia');
  });

  it('pasar las horas del día se puede forzar; el descanso programado solo avisa', () => {
    const morning = trip({
      id: 't0',
      departureAt: at('02:00'),
      arrivalAt: at('09:00'),
    });
    expect(
      levels(
        driverIssues(person({ restDay: true }), trip(), [morning], 30, 12),
      ),
    ).toEqual(['warn', 'override']);
  });
});

describe('collectorIssues', () => {
  it('pide rol de cobrador', () => {
    expect(
      collectorIssues(person({ role: 'collector' }), trip(), [], 30),
    ).toEqual([]);
    expect(levels(collectorIssues(person(), trip(), [], 30))).toEqual([
      'block',
    ]);
  });
});

describe('assignable', () => {
  it('los bloqueos no se fuerzan; los límites solo un admin con motivo', () => {
    expect(assignable([{ level: 'block', message: '' }], true, 'x')).toBe(
      false,
    );
    expect(assignable([{ level: 'override', message: '' }], false, 'x')).toBe(
      false,
    );
    expect(assignable([{ level: 'override', message: '' }], true, ' ')).toBe(
      false,
    );
    expect(
      assignable(
        [
          { level: 'override', message: '' },
          { level: 'warn', message: '' },
        ],
        true,
        'urgente',
      ),
    ).toBe(true);
  });
});
