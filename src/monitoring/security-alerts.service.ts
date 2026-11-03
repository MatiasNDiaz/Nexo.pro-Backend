import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { MAIL_PROVIDER, type MailProvider } from '../integrations/mail/mail-provider';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { AccountStatus, UserRole } from '../users/user.enums';
import { ErrorCounters } from './error-counters';

/** Cada cuánto se revisa y cuánto se mira hacia atrás. */
export const ALERT_WINDOW_MINUTES = 15;
/** Una misma alerta no se repite antes de esto. */
const REPEAT_AFTER_MS = 60 * 60 * 1000;

/**
 * Umbrales por ventana de 15 minutos (SEG §20.3). Altos a propósito: con pocos usuarios, un pico
 * así no es uso normal. Se ajustan con datos reales.
 */
export const ALERT_THRESHOLDS = {
  failedLogins: 50,
  lockedAccounts: 5,
  refreshTokenReuse: 1,
  deniedResponses: 300,
  serverErrors: 10,
} as const;

export type AlertKind = keyof typeof ALERT_THRESHOLDS;

const MESSAGES: Record<AlertKind, (n: number) => string> = {
  failedLogins: (n) => `${n} inicios de sesión fallidos en ${ALERT_WINDOW_MINUTES} minutos.`,
  lockedAccounts: (n) => `${n} cuentas bloqueadas por intentos fallidos.`,
  refreshTokenReuse: (n) =>
    `${n} reutilizaciones de tokens de sesión (posible robo de cookies): se cerraron esos dispositivos.`,
  deniedResponses: (n) => `${n} respuestas 401/403: posible barrido de rutas o de cuentas.`,
  serverErrors: (n) => `${n} errores 500: revisá los logs y Sentry.`,
};

/**
 * Alertas de seguridad (SEG §20.3): picos de logins fallidos, cuentas bloqueadas, reutilización de
 * tokens, muchas respuestas 401/403 y errores 500. Avisa a los admins por notificación y por email,
 * y lo deja en el log. No bloquea nada: solo avisa.
 */
@Injectable()
export class SecurityAlertsService {
  private readonly logger = new Logger(SecurityAlertsService.name);
  private readonly lastSent = new Map<AlertKind, number>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly counters: ErrorCounters,
    private readonly notifications: NotificationsService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /** Revisa la ventana y devuelve las alertas que mandó. */
  async check(now = new Date()): Promise<AlertKind[]> {
    const since = new Date(now.getTime() - ALERT_WINDOW_MINUTES * 60_000);
    const errors = this.counters.drain();
    const rows: Array<{ action: string; count: string }> = await this.dataSource.query(
      `SELECT action, count(*) AS count FROM admin_audit_logs
        WHERE created_at > $1
          AND action IN ('LOGIN_FAILED', 'ACCOUNT_LOCKED', 'REFRESH_TOKEN_REUSE')
        GROUP BY action`,
      [since],
    );
    const audit = (action: string) => Number(rows.find((r) => r.action === action)?.count ?? 0);
    const observed: Record<AlertKind, number> = {
      failedLogins: audit('LOGIN_FAILED'),
      lockedAccounts: audit('ACCOUNT_LOCKED'),
      refreshTokenReuse: audit('REFRESH_TOKEN_REUSE'),
      deniedResponses: errors.unauthorized + errors.forbidden,
      serverErrors: errors.serverErrors,
    };

    const sent: AlertKind[] = [];
    for (const kind of Object.keys(ALERT_THRESHOLDS) as AlertKind[]) {
      if (observed[kind] < ALERT_THRESHOLDS[kind]) continue;
      const last = this.lastSent.get(kind);
      if (last && now.getTime() - last < REPEAT_AFTER_MS) continue;
      this.lastSent.set(kind, now.getTime());
      await this.send(MESSAGES[kind](observed[kind]));
      sent.push(kind);
    }
    return sent;
  }

  private async send(text: string): Promise<void> {
    this.logger.warn(`Alerta de seguridad: ${text}`);
    try {
      const created = await this.dataSource.transaction((manager) =>
        this.notifications.createForAdmins(manager, {
          type: NotificationType.SECURITY_ALERT,
          title: 'Alerta de seguridad',
          body: text,
          targetType: null,
          targetId: null,
        }),
      );
      this.notifications.deliver(created);
      const admins = await this.dataSource.getRepository(User).find({
        where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE, deletedAt: IsNull() },
        select: { email: true },
      });
      for (const admin of admins) {
        await this.mail.send({
          to: admin.email,
          subject: 'Nexo PRO: alerta de seguridad',
          text: `${text}\n\nRevisá la auditoría y los logs. Ver docs/operacion.md (respuesta ante incidentes).`,
        });
      }
    } catch (error) {
      this.logger.error('No se pudo avisar la alerta de seguridad', error as Error);
    }
  }
}
