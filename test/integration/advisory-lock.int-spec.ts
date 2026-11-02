import { DataSource } from 'typeorm';
import { runExclusive } from '../../src/database/advisory-lock';
import { createTestDataSource } from '../setup/test-database';

const KEY = 999_001;

describe('Lock de tareas programadas (integración)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource().initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('una segunda ejecución simultánea no corre; al terminar, el lock se libera', async () => {
    let release: () => void = () => undefined;
    const blocker = new Promise<void>((resolve) => (release = resolve));

    const first = runExclusive(dataSource, KEY, async () => {
      await blocker;
      return 'primera';
    });
    // Esperar a que la primera tome el lock.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(runExclusive(dataSource, KEY, () => Promise.resolve('segunda'))).resolves.toEqual({
      ran: false,
    });

    release();
    await expect(first).resolves.toEqual({ ran: true, result: 'primera' });
    await expect(runExclusive(dataSource, KEY, () => Promise.resolve('tercera'))).resolves.toEqual({
      ran: true,
      result: 'tercera',
    });
  });

  it('libera el lock aunque la tarea falle', async () => {
    await expect(
      runExclusive(dataSource, KEY, () => Promise.reject(new Error('falla'))),
    ).rejects.toThrow('falla');
    await expect(runExclusive(dataSource, KEY, () => Promise.resolve(1))).resolves.toEqual({
      ran: true,
      result: 1,
    });
  });
});
