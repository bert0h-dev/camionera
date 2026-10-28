import {
  BusStatus,
  IncidentSeverity,
  IncidentStatus,
} from '../generated/prisma/enums.js';

/** Folio legible: INC-000123 */
export const incidentFolio = (n: number) => `INC-${String(n).padStart(6, '0')}`;

export const OPEN_INCIDENT: IncidentStatus[] = [
  IncidentStatus.reported,
  IncidentStatus.in_review,
];

export const isOpenIncident = (status: IncidentStatus) =>
  OPEN_INCIDENT.includes(status);

/**
 * Una incidencia crítica saca de servicio a la unidad si está circulando o disponible.
 * En mantenimiento ya está fuera del camino y fuera de servicio ya lo está.
 */
export const takesBusOut = (severity: IncidentSeverity, bus: BusStatus) =>
  severity === IncidentSeverity.critical &&
  (bus === BusStatus.available || bus === BusStatus.in_service);

/**
 * Estado al que regresa una unidad cuando se libera (orden terminada o incidencia cerrada):
 * sigue fuera de servicio mientras tenga incidencias críticas abiertas.
 */
export const releasedStatus = (openCriticals: number) =>
  openCriticals > 0 ? BusStatus.out_of_service : BusStatus.available;

/** Quien reporta puede corregir su reporte solo mientras nadie lo ha revisado. */
export const reporterCanEdit = (status: IncidentStatus) =>
  status === IncidentStatus.reported;

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

/** Orden de atención: críticas primero, luego por gravedad y antigüedad. */
export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
