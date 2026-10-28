import { describe, expect, it } from 'vitest';
import {
  BusStatus,
  IncidentSeverity,
  IncidentStatus,
} from '../generated/prisma/enums.js';
import {
  incidentFolio,
  isOpenIncident,
  releasedStatus,
  reporterCanEdit,
  takesBusOut,
} from './incident-rules.js';

describe('takesBusOut', () => {
  it('la crítica saca de servicio a una unidad disponible o circulando', () => {
    expect(takesBusOut(IncidentSeverity.critical, BusStatus.available)).toBe(
      true,
    );
    expect(takesBusOut(IncidentSeverity.critical, BusStatus.in_service)).toBe(
      true,
    );
  });

  it('no cambia unidades en mantenimiento o ya fuera de servicio', () => {
    expect(takesBusOut(IncidentSeverity.critical, BusStatus.maintenance)).toBe(
      false,
    );
    expect(
      takesBusOut(IncidentSeverity.critical, BusStatus.out_of_service),
    ).toBe(false);
  });

  it('las demás gravedades no sacan de servicio', () => {
    for (const s of [
      IncidentSeverity.low,
      IncidentSeverity.medium,
      IncidentSeverity.high,
    ])
      expect(takesBusOut(s, BusStatus.available)).toBe(false);
  });
});

describe('releasedStatus', () => {
  it('vuelve a disponible sin críticas abiertas', () => {
    expect(releasedStatus(0)).toBe(BusStatus.available);
  });

  it('sigue fuera de servicio con alguna crítica abierta', () => {
    expect(releasedStatus(1)).toBe(BusStatus.out_of_service);
  });
});

describe('estados', () => {
  it('reportada y en revisión están abiertas', () => {
    expect(isOpenIncident(IncidentStatus.reported)).toBe(true);
    expect(isOpenIncident(IncidentStatus.in_review)).toBe(true);
    expect(isOpenIncident(IncidentStatus.resolved)).toBe(false);
    expect(isOpenIncident(IncidentStatus.dismissed)).toBe(false);
  });

  it('quien reporta solo corrige antes de la revisión', () => {
    expect(reporterCanEdit(IncidentStatus.reported)).toBe(true);
    expect(reporterCanEdit(IncidentStatus.in_review)).toBe(false);
  });

  it('folio con seis dígitos', () => {
    expect(incidentFolio(12)).toBe('INC-000012');
  });
});
