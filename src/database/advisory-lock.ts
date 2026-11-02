import type { DataSource } from 'typeorm';

/** Claves de los locks de las tareas programadas (únicas en todo el proyecto). */
export const ADVISORY_LOCKS = {
  ACCOUNTS_PURGE: 7_001,
  UPLOADS_CLEANUP: 7_002,
} as const;

/**
 * Corre `task` solo si nadie más tiene el lock (otra instancia de la API o el comando de consola).
 * Usa un lock de sesión de PostgreSQL sobre una conexión dedicada: se libera al terminar o si el
 * proceso muere. Devuelve `{ ran: false }` si el lock estaba tomado.
 */
export async function runExclusive<T>(
  dataSource: DataSource,
  key: number,
  task: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const query = 'SELECT pg_try_advisory_lock($1) AS locked';
    const rows = (await runner.query(query, [key])) as Array<{ locked: boolean }>;
    if (!rows[0]?.locked) return { ran: false };
    try {
      return { ran: true, result: await task() };
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    await runner.release();
  }
}
