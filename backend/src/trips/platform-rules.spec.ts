import { describe, expect, it } from 'vitest';
import {
  occupancyWindow,
  platformConflicts,
  platformIssues,
  type PlatformTrip,
} from './platform-rules.js';

const at = (h: string) => new Date(`2026-11-02T${h}:00Z`);
const trip = (over: Partial<PlatformTrip> = {}): PlatformTrip => ({
  id: 't1',
  tripNumber: 'GDL-MEX-261102-0800',
  departureAt: at('14:00'),
  platformId: 'p1',
  ...over,
});
const platform = { id: 'p1', code: '1', terminalId: 'GDL', isActive: true };

describe('occupancyWindow', () => {
  it('va de N minutos antes a la salida', () => {
    expect(occupancyWindow(at('14:00'), 30)).toEqual({
      from: at('13:30'),
      to: at('14:00'),
    });
  });
});

describe('platformConflicts', () => {
  it('detecta otro recorrido dentro de la ventana', () => {
    const other = trip({ id: 't2', departureAt: at('14:20') });
    expect(platformConflicts(trip(), 'p1', [other], 30)).toEqual([other]);
  });

  it('no choca si las ventanas no se tocan', () => {
    const other = trip({ id: 't2', departureAt: at('14:31') });
    expect(platformConflicts(trip(), 'p1', [other], 30)).toEqual([]);
  });

  it('ignora otros andenes y al propio recorrido', () => {
    const others = [trip(), trip({ id: 't2', platformId: 'p2' })];
    expect(platformConflicts(trip(), 'p1', others, 30)).toEqual([]);
  });

  it('con 0 minutos solo chocan salidas a la misma hora', () => {
    const same = trip({ id: 't2' });
    const later = trip({ id: 't3', departureAt: at('14:01') });
    expect(platformConflicts(trip(), 'p1', [same, later], 0)).toEqual([same]);
  });
});

describe('platformIssues', () => {
  it('sin observaciones si está libre', () => {
    expect(platformIssues(platform, 'GDL', [])).toEqual([]);
  });

  it('bloquea un andén de otra terminal o desactivado', () => {
    const issues = platformIssues(
      { ...platform, terminalId: 'MEX', isActive: false },
      'GDL',
      [],
    );
    expect(issues.map((i) => i.level)).toEqual(['block', 'block']);
  });

  it('ocupado se puede forzar', () => {
    const [issue] = platformIssues(platform, 'GDL', [{ tripNumber: 'X-1' }]);
    expect(issue.level).toBe('override');
    expect(issue.message).toContain('X-1');
  });
});
