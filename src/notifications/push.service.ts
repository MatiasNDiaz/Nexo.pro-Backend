import {
  BadRequestException,
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MAX_DEVICES } from '../auth/services/sessions.service';
import type { AuthUser } from '../common/decorators';
import {
  PUSH_PROVIDER,
  isPushServiceEndpoint,
  type PushProvider,
} from '../integrations/push/push-provider';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { NotificationPreferenceDto, PushKeyDto, PushSubscribeDto } from './dto/push.dto';
import type { Notification } from './entities/notification.entity';
import { NotificationPreference, PushSubscription } from './entities/push.entities';
import { CATEGORY_OF, categoriesFor, URGENT_CATEGORIES } from './notification-categories';

/** Fallas seguidas (que no sean 404/410) antes de borrar la suscripción. */
export const MAX_PUSH_FAILURES = 5;
/** Si el dispositivo está apagado, el servicio de push guarda el aviso hasta un día. */
const TTL_SEC = 24 * 60 * 60;
/** Envíos simultáneos (una novedad para todos genera muchos: van por tandas). */
const CONCURRENCY = 10;

interface TargetRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Notificaciones push web (ADR 0032). Cada aviso que se crea en la plataforma sale también por
 * push, después del commit y sin demorar al que lo generó, salvo que la persona tenga la app
 * abierta o haya apagado esa categoría. Solo a dispositivos con una sesión abierta. Mismo título y
 * texto que en la plataforma (el de chat nunca incluye el mensaje).
 */
@Injectable()
export class PushService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PushService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly dataSource: DataSource,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider | null,
    private readonly realtime: RealtimeGateway,
  ) {}

  publicKey(): PushKeyDto {
    return { enabled: this.provider !== null, publicKey: this.provider?.publicKey ?? null };
  }

  /**
   * Alta o actualización de la suscripción de este navegador. Si ya estaba (por ejemplo, de otra
   * cuenta que usó el mismo navegador), pasa a la cuenta y el dispositivo actuales.
   */
  async subscribe(user: AuthUser, dto: PushSubscribeDto): Promise<void> {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        code: 'PUSH_DISABLED',
        message: 'Las notificaciones push no están disponibles.',
      });
    }
    if (!isPushServiceEndpoint(dto.endpoint)) {
      throw new BadRequestException({
        code: 'INVALID_PUSH_ENDPOINT',
        message: 'La suscripción no es de un servicio de notificaciones conocido.',
      });
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO push_subscriptions (user_id, family_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id, family_id = EXCLUDED.family_id,
               p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               created_at = now(), failure_count = 0`,
        [user.id, user.familyId, dto.endpoint, dto.keys.p256dh, dto.keys.auth],
      );
      // Como los dispositivos con sesión: hasta 10 por cuenta, se van los más viejos.
      await manager.query(
        `DELETE FROM push_subscriptions WHERE id IN (
           SELECT id FROM push_subscriptions WHERE user_id = $1
            ORDER BY created_at DESC OFFSET $2)`,
        [user.id, MAX_DEVICES],
      );
    });
  }

  /** Baja de este navegador (el frontend la llama al desactivar los avisos). */
  async unsubscribe(user: AuthUser, endpoint: string): Promise<void> {
    await this.dataSource.getRepository(PushSubscription).delete({ userId: user.id, endpoint });
  }

  async preferences(user: AuthUser): Promise<NotificationPreferenceDto[]> {
    const rows = await this.dataSource
      .getRepository(NotificationPreference)
      .findBy({ userId: user.id });
    const saved = new Map(rows.map((r) => [r.category, r.push]));
    return categoriesFor(user.role).map((category) => ({
      category,
      push: saved.get(category) ?? true,
    }));
  }

  async updatePreferences(
    user: AuthUser,
    preferences: NotificationPreferenceDto[],
  ): Promise<NotificationPreferenceDto[]> {
    const allowed = new Set(categoriesFor(user.role));
    const invalid = preferences.find((p) => !allowed.has(p.category));
    if (invalid) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: `La categoría ${invalid.category} no corresponde a tu cuenta.`,
      });
    }
    await this.dataSource.getRepository(NotificationPreference).upsert(
      preferences.map((p) => ({ userId: user.id, category: p.category, push: p.push })),
      ['userId', 'category'],
    );
    return this.preferences(user);
  }

  /** Después del commit (lo llama `NotificationsService.deliver`). No espera los envíos. */
  send(notifications: Notification[]): void {
    if (!this.provider || notifications.length === 0) return;
    const job: Promise<void> = this.sendAll(notifications)
      .catch((error: unknown) => this.logger.error('Falló el envío de push', error as Error))
      .finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  /** Espera los envíos en curso (al apagar la app y en los tests). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.flush();
  }

  private async sendAll(notifications: Notification[]): Promise<void> {
    for (let i = 0; i < notifications.length; i += CONCURRENCY) {
      await Promise.all(notifications.slice(i, i + CONCURRENCY).map((n) => this.sendOne(n)));
    }
  }

  private async sendOne(notification: Notification): Promise<void> {
    const provider = this.provider!;
    const category = CATEGORY_OF[notification.type];
    if (await this.realtime.isOnline(notification.userId)) return;
    const preference = await this.dataSource
      .getRepository(NotificationPreference)
      .findOneBy({ userId: notification.userId, category });
    if (preference && !preference.push) return;

    // Solo dispositivos con una sesión abierta: al cerrar sesión, ese navegador deja de recibir.
    const targets = await this.dataSource.query<TargetRow[]>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps
        WHERE ps.user_id = $1
          AND EXISTS (
            SELECT 1 FROM auth_sessions s
             WHERE s.family_id = ps.family_id AND s.user_id = ps.user_id AND s.revoked_at IS NULL
               AND s.expires_at > now() AND s.family_expires_at > now())`,
      [notification.userId],
    );
    if (targets.length === 0) return;

    const message = {
      payload: JSON.stringify({
        id: notification.id,
        type: notification.type,
        category,
        title: notification.title,
        body: notification.body,
        targetType: notification.targetType,
        targetId: notification.targetId,
        // Avisos con el mismo tag se reemplazan en la pantalla en vez de acumularse.
        tag: `${notification.type}:${notification.targetId ?? notification.id}`,
      }),
      ttlSec: TTL_SEC,
      urgency: URGENT_CATEGORIES.has(category) ? ('high' as const) : ('normal' as const),
    };
    for (const target of targets) {
      const outcome = await provider.send(target, message);
      await this.record(target.id, outcome);
    }
  }

  /** Éxito, suscripción que ya no existe (se borra) o falla (con 5 seguidas, se borra). */
  private async record(id: string, outcome: 'SENT' | 'GONE' | 'FAILED'): Promise<void> {
    const repository = this.dataSource.getRepository(PushSubscription);
    if (outcome === 'SENT') {
      await repository.update(id, { lastSuccessAt: new Date(), failureCount: 0 });
      return;
    }
    if (outcome === 'GONE') {
      await repository.delete(id);
      return;
    }
    // Sin el endpoint en el log: es una URL que permite mandarle avisos a ese navegador.
    this.logger.warn(`Falló un push (suscripción ${id})`);
    await repository.increment({ id }, 'failureCount', 1);
    await this.dataSource.query(
      `DELETE FROM push_subscriptions WHERE id = $1 AND failure_count >= $2`,
      [id, MAX_PUSH_FAILURES],
    );
  }
}
