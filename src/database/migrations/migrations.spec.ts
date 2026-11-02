import { readdirSync } from 'fs';
import { MIGRATIONS } from '.';

const timestampOf = (name: string) => Number(/(\d{13})$/.exec(name)?.[1]);

describe('lista de migraciones', () => {
  const files = readdirSync(__dirname).filter((file) => /^\d{13}-.+\.ts$/.test(file));
  const names = MIGRATIONS.map((Migration) => new Migration().name ?? '');

  it('registra todos los archivos de la carpeta (ninguna migración queda afuera)', () => {
    const fileTimestamps = files.map((file) => Number(file.slice(0, 13))).sort();
    expect(names.map(timestampOf)).toEqual(fileTimestamps);
  });

  it('está en orden cronológico y sin nombres repetidos', () => {
    const timestamps = names.map(timestampOf);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(names).size).toBe(names.length);
  });
});
