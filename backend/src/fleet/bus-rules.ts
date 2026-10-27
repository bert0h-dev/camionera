// Reglas de negocio de las unidades, sin base de datos para poder probarlas solas.
import { documentState } from '../staff/documents/document-status.js';
import { seatsOf, type BusLayout } from './layout-rules.js';

export type BusStatusValue =
  'available' | 'in_service' | 'maintenance' | 'out_of_service';
export type BusDocumentTypeValue =
  | 'insurance'
  | 'circulation_card'
  | 'sict_permit'
  | 'emissions_check'
  | 'other';

/** Documentos sin los cuales la unidad no puede salir. */
export const REQUIRED_DOCUMENTS: BusDocumentTypeValue[] = [
  'insurance',
  'circulation_card',
];

export const DOCUMENT_LABELS: Record<BusDocumentTypeValue, string> = {
  insurance: 'Seguro',
  circulation_card: 'Tarjeta de circulación',
  sict_permit: 'Permiso SICT',
  emissions_check: 'Verificación',
  other: 'Otro',
};

const STATUS_LABELS: Record<BusStatusValue, string> = {
  available: 'disponible',
  in_service: 'en servicio',
  maintenance: 'en mantenimiento',
  out_of_service: 'fuera de servicio',
};

interface FitnessInput {
  status: BusStatusValue;
  terminalLocated: boolean;
  documents: {
    type: BusDocumentTypeValue;
    issueDate: Date;
    expiryDate: Date | null;
  }[];
}

/**
 * Apta = disponible (o ya en servicio), con seguro y tarjeta de circulación vigentes hoy
 * y con terminal base ubicada en el mapa. Devuelve los motivos cuando no lo es.
 */
export function busFitness(bus: FitnessInput, today: Date) {
  const reasons: string[] = [];
  if (bus.status === 'maintenance' || bus.status === 'out_of_service')
    reasons.push(`La unidad está ${STATUS_LABELS[bus.status]}`);
  for (const type of REQUIRED_DOCUMENTS) {
    const valid = bus.documents.some(
      (d) =>
        d.type === type &&
        d.issueDate <= today &&
        (!d.expiryDate || d.expiryDate >= today),
    );
    if (!valid)
      reasons.push(`${DOCUMENT_LABELS[type]} sin registrar o vencido`);
  }
  if (!bus.terminalLocated)
    reasons.push('La terminal base no tiene ubicación en el mapa');
  return { fit: reasons.length === 0, reasons };
}

/**
 * Situación de los documentos más recientes de cada tipo: el peor estado manda.
 * Solo se considera el último documento de cada tipo (los anteriores quedan como historial).
 */
export function documentsSummary(
  documents: {
    type: BusDocumentTypeValue;
    expiryDate: Date | null;
    issueDate: Date;
  }[],
  today: Date,
  alertDays: number,
) {
  const latest = new Map<BusDocumentTypeValue, (typeof documents)[number]>();
  for (const d of documents) {
    const prev = latest.get(d.type);
    if (!prev || d.issueDate > prev.issueDate) latest.set(d.type, d);
  }
  let expiring = 0;
  let expired = 0;
  for (const d of latest.values()) {
    const { status } = documentState(d.expiryDate, today, alertDays);
    if (status === 'expiring') expiring++;
    if (status === 'expired') expired++;
  }
  return { expiring, expired };
}

/** El odómetro nunca baja. Devuelve el error o null. */
export function odometerError(currentKm: number, newKm: number) {
  if (!Number.isInteger(newKm) || newKm < 0)
    return 'El odómetro debe ser un número entero positivo';
  if (newKm < currentKm)
    return `El odómetro no puede bajar: la lectura actual es ${currentKm.toLocaleString('es-MX')} km`;
  return null;
}

/** Copia los asientos de la plantilla del modelo para una unidad nueva. */
export function seatsFromLayout(layout: BusLayout) {
  return seatsOf(layout).map((s) => ({
    floor: s.floor,
    row: s.r,
    col: s.c,
    number: s.number!,
    category: s.category ?? 'normal',
  }));
}
