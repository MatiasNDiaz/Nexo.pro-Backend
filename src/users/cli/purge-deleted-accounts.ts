import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { AccountsService } from '../accounts.service';

/**
 * `npm run accounts:purge`: anonimiza las cuentas cuyo período de gracia venció (ADR 0016).
 * Correrlo una vez por día (en producción, un cron del proveedor:
 * `node dist/users/cli/purge-deleted-accounts.js`). Es idempotente.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const purged = await app.get(AccountsService).purgeExpiredDeletions();
    process.stdout.write(`Cuentas anonimizadas: ${purged}\n`);
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
