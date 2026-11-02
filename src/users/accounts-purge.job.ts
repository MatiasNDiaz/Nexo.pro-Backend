import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';
import { AccountsService } from './accounts.service';

/**
 * Anonimiza todos los días, a las 3:00 de Córdoba, las cuentas cuya baja venció (ADR 0016). El
 * lock de PostgreSQL evita que dos instancias (o el comando `accounts:purge`) corran a la vez.
 */
@Injectable()
export class AccountsPurgeJob {
  private readonly logger = new Logger(AccountsPurgeJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
  ) {}

  @Cron('0 3 * * *', {
    name: 'accounts-purge',
    timeZone: 'America/Argentina/Cordoba',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.ACCOUNTS_PURGE, () =>
        this.accounts.purgeExpiredDeletions(),
      );
      if (!outcome.ran) {
        this.logger.warn('La purga de cuentas ya está corriendo en otro proceso');
      } else {
        this.logger.log(`Cuentas anonimizadas: ${outcome.result}`);
      }
    } catch (error) {
      this.logger.error('Falló la purga de cuentas', error as Error);
    }
  }
}
