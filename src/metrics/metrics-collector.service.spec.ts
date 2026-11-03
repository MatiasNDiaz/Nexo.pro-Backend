import type { DataSource } from 'typeorm';
import { today } from '../common/calendar-periods';
import { MetricsCollector } from './metrics-collector.service';

/** Base de mentira: guarda los parámetros de cada INSERT. */
function collector() {
  const calls: unknown[][] = [];
  const dataSource = {
    query: (_sql: string, params: unknown[]) => {
      calls.push(params);
      return Promise.resolve([]);
    },
  } as unknown as DataSource;
  return { metrics: new MetricsCollector(dataSource), calls };
}

const A = { profileId: 'perfil-a', userId: 'usuario-a' };
const B = { profileId: 'perfil-b', userId: 'usuario-b' };
const visitor = (key: string, userId: string | null = null) => ({ key, userId });

describe('MetricsCollector (ADR 0033)', () => {
  it('cuenta personas distintas: recargar no suma; primer lugar solo en la página 1', async () => {
    const { metrics, calls } = collector();
    metrics.recordSearch([A, B], 1, visitor('a:1'));
    metrics.recordSearch([A, B], 1, visitor('a:1'));
    metrics.recordSearch([A, B], 2, visitor('a:2'));
    metrics.recordProfileView(A, visitor('a:1'));
    metrics.recordProfileView(A, visitor('a:1'));
    await metrics.flush();

    const day = today();
    // [perfil, día, personas en el perfil, apariciones, primer lugar]
    expect(calls[0]).toEqual(['perfil-a', day, 1, 2, 1, 'perfil-b', day, 0, 2, 0]);
  });

  it('el propio profesional no cuenta, pero sí suma para los demás que ve', async () => {
    const { metrics, calls } = collector();
    metrics.recordSearch([A, B], 1, visitor('u:usuario-a', 'usuario-a'));
    metrics.recordProfileView(A, visitor('u:usuario-a', 'usuario-a'));
    await metrics.flush();
    expect(calls[0]).toEqual(['perfil-b', today(), 0, 1, 0]);
  });

  it('sin nada nuevo no escribe; después de guardar, empieza de cero', async () => {
    const { metrics, calls } = collector();
    await metrics.flush();
    expect(calls).toHaveLength(0);
    metrics.recordProfileView(B, visitor('a:9'));
    await metrics.flush();
    await metrics.flush();
    expect(calls).toHaveLength(1);
  });
});
