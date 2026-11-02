import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { ADVISORY_LOCKS, runExclusive } from '../../database/advisory-lock';
import { AccountsService } from '../accounts.service';

/**
 * `npm run accounts:purge`: anonimiza ya las cuentas cuyo período de gracia venció (ADR 0016).
 * La API lo hace sola todos los días (`AccountsPurgeJob`); este comando sirve para correrlo a mano.
 * Comparte el lock con la tarea diaria, así nunca corren a la vez. Es idempotente.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const outcome = await runExclusive(app.get(DataSource), ADVISORY_LOCKS.ACCOUNTS_PURGE, () =>
      app.get(AccountsService).purgeExpiredDeletions(),
    );
    process.stdout.write(
      outcome.ran
        ? `Cuentas anonimizadas: ${outcome.result}\n`
        : 'La purga ya está corriendo en otro proceso.\n',
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Purga fallida: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
