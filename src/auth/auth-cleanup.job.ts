import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';

/** Plazos de la limpieza (aprobados el 03/11/2026). */
export const CLEANUP_RETENTION = {
  sessionsDays: 30,
  oneTimeTokensDays: 7,
  oauthPendingDays: 1,
} as const;

export interface CleanupResult {
  sessions: number;
  oneTimeTokens: number;
  oauthPending: number;
  pushSubscriptions: number;
}

/**
 * Borra lo que ya no sirve (etapa 12): sesiones vencidas o cerradas hace más de 30 días, enlaces de
 * un solo uso usados o vencidos hace más de 7 y pedidos de Google pendientes de más de 1 día.
 * Una sesión solo se borra si su dispositivo ya venció del todo: así un token viejo presentado
 * todavía dispara la detección de reutilización mientras la familia siga vigente.
 */
export async function purgeExpiredAuthData(
  dataSource: DataSource,
  now = new Date(),
): Promise<CleanupResult> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [, sessions]: [unknown, number] = await dataSource.query(
    `DELETE FROM auth_sessions
      WHERE family_expires_at < $1
        AND COALESCE(revoked_at, expires_at) < $2`,
    [now, daysAgo(CLEANUP_RETENTION.sessionsDays)],
  );
  const [, oneTimeTokens]: [unknown, number] = await dataSource.query(
    `DELETE FROM one_time_tokens WHERE COALESCE(used_at, expires_at) < $1`,
    [daysAgo(CLEANUP_RETENTION.oneTimeTokensDays)],
  );
  const [, oauthPending]: [unknown, number] = await dataSource.query(
    `DELETE FROM oauth_pending_requests WHERE expires_at < $1`,
    [daysAgo(CLEANUP_RETENTION.oauthPendingDays)],
  );
  // Push de dispositivos sin sesión abierta (ADR 0032): ya no reciben avisos.
  const [, pushSubscriptions]: [unknown, number] = await dataSource.query(
    `DELETE FROM push_subscriptions ps
      WHERE NOT EXISTS (
        SELECT 1 FROM auth_sessions s
         WHERE s.family_id = ps.family_id AND s.user_id = ps.user_id AND s.revoked_at IS NULL
           AND s.expires_at > $1 AND s.family_expires_at > $1)`,
    [now],
  );
  return { sessions, oneTimeTokens, oauthPending, pushSubscriptions };
}

/** Todos los días a las 4:00 de Córdoba (poca actividad). */
@Injectable()
export class AuthCleanupJob {
  private readonly logger = new Logger(AuthCleanupJob.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 4 * * *', {
    name: 'auth-cleanup',
    timeZone: 'America/Argentina/Cordoba',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.AUTH_CLEANUP, () =>
        purgeExpiredAuthData(this.dataSource),
      );
      if (outcome.ran) {
        const { sessions, oneTimeTokens, oauthPending, pushSubscriptions } = outcome.result;
        this.logger.log(
          `Limpieza: ${sessions} sesiones, ${oneTimeTokens} enlaces, ${oauthPending} pedidos de Google, ${pushSubscriptions} suscripciones push`,
        );
      }
    } catch (error) {
      this.logger.error('Falló la limpieza de sesiones y enlaces vencidos', error as Error);
    }
  }
}
