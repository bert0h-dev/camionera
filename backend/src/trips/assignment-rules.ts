// Reglas puras para asignar unidad, conductor y cobrador a un recorrido.

import {
  busFitness,
  type BusDocumentTypeValue,
  type BusStatusValue,
} from '../fleet/bus-rules.js';

/**
 * - block: no se puede asignar.
 * - override: rompe un límite de horas; solo un admin puede forzarlo con motivo.
 * - warn: se puede asignar, pero conviene revisarlo.
 */
export type IssueLevel = 'block' | 'override' | 'warn';

export interface Issue {
  level: IssueLevel;
  message: string;
}

export interface TripWindow {
  id: string;
  tripNumber: string;
  tripDate: string;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
  originTerminalId: string;
  destinationTerminalId: string;
  destinationCode: string;
}

const MIN = 60_000;

/** Otro recorrido que se encima con `trip`, contando el descanso mínimo entre ambos. */
export function overlapping(
  trip: Pick<TripWindow, 'id' | 'departureAt' | 'arrivalAt'>,
  others: TripWindow[],
  gapMinutes: number,
) {
  const gap = gapMinutes * MIN;
  return others.find(
    (o) =>
      o.id !== trip.id &&
      o.departureAt.getTime() < trip.arrivalAt.getTime() + gap &&
      o.arrivalAt.getTime() + gap > trip.departureAt.getTime(),
  );
}

const overlapMessage = (who: string, other: TripWindow, gapMinutes: number) =>
  `${who} ya tiene el recorrido ${other.tripNumber}${
    gapMinutes
      ? ` (se piden ${gapMinutes} min de descanso entre recorridos)`
      : ''
  }`;

export interface BusCandidate {
  status: BusStatusValue;
  terminalId: string;
  terminalCode: string;
  terminalLocated: boolean;
  seats: number;
  documents: {
    type: BusDocumentTypeValue;
    issueDate: Date;
    expiryDate: Date | null;
  }[];
}

/**
 * Unidad: apta en la fecha del viaje (estado y documentos), con asientos, sin recorridos
 * encimados. Avisa si no va a estar en la terminal de origen.
 */
export function busIssues(
  bus: BusCandidate,
  trip: TripWindow,
  busTrips: TripWindow[],
  turnaroundMinutes: number,
): Issue[] {
  const issues: Issue[] = [];
  const day = new Date(`${trip.tripDate}T00:00:00Z`);
  for (const reason of busFitness(bus, day).reasons)
    // La ubicación de la terminal base no impide salir de otra terminal
    if (!reason.startsWith('La terminal base'))
      issues.push({ level: 'block', message: reason });
  if (bus.seats === 0)
    issues.push({ level: 'block', message: 'La unidad no tiene asientos' });
  const clash = overlapping(trip, busTrips, turnaroundMinutes);
  if (clash)
    issues.push({
      level: 'block',
      message: overlapMessage('La unidad', clash, turnaroundMinutes),
    });

  // Dónde estará: al final de su recorrido anterior o, si no tiene, en su terminal base
  const before = busTrips
    .filter((o) => o.id !== trip.id && o.arrivalAt <= trip.departureAt)
    .sort((a, b) => b.arrivalAt.getTime() - a.arrivalAt.getTime())[0];
  if (before) {
    if (before.destinationTerminalId !== trip.originTerminalId)
      issues.push({
        level: 'warn',
        message: `Su recorrido anterior (${before.tripNumber}) termina en ${before.destinationCode}`,
      });
  } else if (bus.terminalId !== trip.originTerminalId)
    issues.push({
      level: 'warn',
      message: `Su terminal base es ${bus.terminalCode}`,
    });
  return issues;
}

export interface StaffCandidate {
  role: string;
  status: string;
  /** Vencimientos de sus licencias (solo conductores) */
  licenseExpiries: Date[];
  /** Tiene descanso programado el día del viaje */
  restDay: boolean;
}

const STAFF_STATUS: Record<string, string> = {
  inactive: 'está dado de baja',
  vacation: 'está de vacaciones',
  sick_leave: 'tiene incapacidad',
  suspended: 'está suspendido',
};

function staffBase(
  person: StaffCandidate,
  role: 'driver' | 'collector',
  trip: TripWindow,
  ownTrips: TripWindow[],
  gapMinutes: number,
  who: string,
): Issue[] {
  const issues: Issue[] = [];
  if (person.role !== role)
    issues.push({
      level: 'block',
      message: role === 'driver' ? 'No es conductor' : 'No es cobrador',
    });
  if (person.status !== 'active')
    issues.push({
      level: 'block',
      message: `${who} ${STAFF_STATUS[person.status] ?? 'no está activo'}`,
    });
  const clash = overlapping(trip, ownTrips, gapMinutes);
  if (clash)
    issues.push({
      level: 'block',
      message: overlapMessage(who, clash, gapMinutes),
    });
  if (person.restDay)
    issues.push({
      level: 'warn',
      message: 'Tiene descanso programado ese día',
    });
  return issues;
}

/**
 * Conductor: activo, con licencia vigente hasta la llegada, sin recorridos encimados
 * (con descanso entre ellos) y sin pasar las horas máximas de manejo del día.
 */
export function driverIssues(
  person: StaffCandidate,
  trip: TripWindow,
  ownTrips: TripWindow[],
  gapMinutes: number,
  maxShiftHours: number,
): Issue[] {
  const issues = staffBase(
    person,
    'driver',
    trip,
    ownTrips,
    gapMinutes,
    'El conductor',
  );
  const arrivalDay = new Date(
    `${trip.arrivalAt.toISOString().slice(0, 10)}T00:00:00Z`,
  );
  if (!person.licenseExpiries.some((d) => d >= arrivalDay))
    issues.push({
      level: 'block',
      message: 'Sin licencia vigente para la fecha del viaje',
    });
  const minutes =
    trip.durationMinutes +
    ownTrips
      .filter((o) => o.id !== trip.id && o.tripDate === trip.tripDate)
      .reduce((n, o) => n + o.durationMinutes, 0);
  if (minutes > maxShiftHours * 60)
    issues.push({
      level: 'override',
      message: `Sumaría ${Math.round((minutes / 60) * 10) / 10} h de manejo ese día (máximo ${maxShiftHours} h)`,
    });
  return issues;
}

/** Cobrador: activo y sin recorridos encimados. */
export function collectorIssues(
  person: StaffCandidate,
  trip: TripWindow,
  ownTrips: TripWindow[],
  gapMinutes: number,
): Issue[] {
  return staffBase(
    person,
    'collector',
    trip,
    ownTrips,
    gapMinutes,
    'El cobrador',
  );
}

/** Sin bloqueos; si hay límites rotos, solo con motivo de un admin. */
export function assignable(
  issues: Issue[],
  canOverride: boolean,
  reason: string | null | undefined,
) {
  if (issues.some((i) => i.level === 'block')) return false;
  if (issues.some((i) => i.level === 'override'))
    return canOverride && !!reason?.trim();
  return true;
}

/** Estados en que todavía se puede cambiar la asignación (antes de salir). */
export const ASSIGNABLE_STATUSES = [
  'scheduled',
  'boarding',
  'delayed',
] as const;

/**
 * Asientos con boletos vendidos que no existen en la unidad nueva (Módulo 6). Si hay alguno,
 * el cambio de unidad se bloquea: primero se cambia de asiento a esos pasajeros.
 */
export function missingSeats(soldSeats: string[], busSeats: string[]) {
  const available = new Set(busSeats);
  return [...new Set(soldSeats)]
    .filter((s) => !available.has(s))
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
