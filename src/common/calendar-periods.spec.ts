import {
  bucketStart,
  bucketsOf,
  currentMonthToDate,
  daysIn,
  previousRange,
  today,
} from './calendar-periods';

describe('Períodos de calendario (panel de ingresos y métricas)', () => {
  it('el mes hasta hoy se compara con los mismos días del mes anterior', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-03' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-03',
    });
  });

  it('un mes completo se compara con el mes anterior completo, aunque tenga otro largo', () => {
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(previousRange({ from: '2028-02-01', to: '2028-02-29' })).toEqual({
      from: '2028-01-01',
      to: '2028-01-31',
    });
  });

  it('un año completo con el año anterior y un trimestre con el anterior', () => {
    expect(previousRange({ from: '2026-01-01', to: '2026-12-31' })).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(previousRange({ from: '2026-01-01', to: '2026-03-31' })).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
  });

  it('un rango que no empieza el día 1 se corre en días (una semana con la anterior)', () => {
    expect(previousRange({ from: '2026-11-02', to: '2026-11-08' })).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
    expect(daysIn({ from: '2026-11-02', to: '2026-11-08' })).toBe(7);
  });

  it('las semanas empiezan el lunes; los meses el 1 y los años el 1 de enero', () => {
    // 2026-11-08 es domingo.
    expect(bucketStart('2026-11-08', 'week')).toBe('2026-11-02');
    expect(bucketStart('2026-11-02', 'week')).toBe('2026-11-02');
    expect(bucketStart('2026-11-18', 'month')).toBe('2026-11-01');
    expect(bucketStart('2026-11-18', 'year')).toBe('2026-01-01');
  });

  it('lista todos los períodos del rango, también los vacíos', () => {
    expect(bucketsOf({ from: '2026-10-30', to: '2026-11-02' }, 'day')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(bucketsOf({ from: '2026-11-05', to: '2026-11-20' }, 'week')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
    expect(bucketsOf({ from: '2026-01-31', to: '2026-04-01' }, 'month')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
    expect(bucketsOf({ from: '2025-06-01', to: '2026-02-01' }, 'year')).toEqual([
      '2025-01-01',
      '2026-01-01',
    ]);
  });

  it('el día de hoy es el de Córdoba, no el del servidor', () => {
    // 01:30 UTC del 1 de diciembre = 22:30 del 30 de noviembre en Córdoba.
    const now = new Date('2026-12-01T01:30:00Z');
    expect(today(now)).toBe('2026-11-30');
    expect(currentMonthToDate(now)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});
