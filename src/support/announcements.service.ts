import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import {
  Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/user.enums';
import type {
  AdminAnnouncementDto,
  AdminMessageDto,
  AnnouncementDto,
  CreateAnnouncementDto,
} from './dto/support.dto';
import { Announcement, type AnnouncementSegment } from './entities/support.entities';

/**
 * Novedades del admin (FI §21, ADR 0029): a todos o por rol, profesión o plan, como notificación
 * (el texto completo se lee con GET /announcements/:id). También mensajes a un usuario.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  /** Crea y publica: una notificación por cada cuenta activa que cumple el segmento. */
  async publish(admin: AuthUser, dto: CreateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const segment: AnnouncementSegment = {
      ...(dto.segment?.roles?.length && { roles: dto.segment.roles }),
      ...(dto.segment?.professionIds?.length && { professionIds: dto.segment.professionIds }),
      ...(dto.segment?.planCodes?.length && { planCodes: dto.segment.planCodes }),
    };
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Announcement);
      const announcement = repository.create({
        authorId: admin.id,
        title: dto.title,
        body: dto.body,
        segment,
        publishedAt: new Date(),
      });
      await repository.insert(announcement);
      const [{ count }]: Array<{ count: string }> = await manager.query(
        `WITH inserted AS (
           INSERT INTO notifications (user_id, type, title, body, target_type, target_id)
           SELECT u.id, $1, $2, $3, $4, $5
             FROM users u
            WHERE u.deleted_at IS NULL
              AND u.status IN ('ACTIVE', 'PENDING_VERIFICATION')
              AND u.role::text = ANY($6::text[])
              AND ($7::uuid[] IS NULL OR EXISTS (
                    SELECT 1 FROM professional_profiles p
                      JOIN professional_professions pp ON pp.professional_id = p.id
                     WHERE p.user_id = u.id AND p.deactivated_at IS NULL
                       AND pp.profession_id = ANY($7::uuid[])))
              AND ($8::text[] IS NULL OR EXISTS (
                    SELECT 1 FROM subscriptions s
                      JOIN subscription_plans sp ON sp.id = s.plan_id
                     WHERE s.user_id = u.id AND s.status IN ('TRIAL', 'ACTIVE')
                       AND sp.code = ANY($8::text[])))
           RETURNING 1)
         SELECT count(*) AS count FROM inserted`,
        [
          NotificationType.ANNOUNCEMENT,
          dto.title,
          dto.body.slice(0, 300),
          NotificationTarget.ANNOUNCEMENT,
          announcement.id,
          segment.roles ?? [UserRole.CUSTOMER, UserRole.PROFESSIONAL],
          segment.professionIds ?? null,
          segment.planCodes ?? null,
        ],
      );
      await this.audit.record(
        {
          actorId: admin.id,
          action: 'ANNOUNCEMENT_PUBLISHED',
          targetType: 'ANNOUNCEMENT',
          targetId: announcement.id,
          reason: null,
          result: 'SUCCESS',
          metadata: { recipients: Number(count) },
        },
        manager,
      );
      return announcement.id;
    });
    return (await this.adminList()).find((a) => a.id === id)!;
  }

  async adminList(): Promise<AdminAnnouncementDto[]> {
    const rows = await this.dataSource
      .getRepository(Announcement)
      .find({ order: { createdAt: 'DESC' }, take: 100 });
    const counts: Array<{ id: string; count: string }> = rows.length
      ? await this.dataSource.query(
          `SELECT target_id AS id, count(*) AS count FROM notifications
            WHERE type = $1 AND target_id = ANY($2) GROUP BY target_id`,
          [NotificationType.ANNOUNCEMENT, rows.map((r) => r.id)],
        )
      : [];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.publishedAt,
      segment: row.segment,
      recipients: Number(counts.find((c) => c.id === row.id)?.count ?? 0),
    }));
  }

  /** Texto completo, solo para quien la recibió. */
  async get(user: AuthUser, id: string): Promise<AnnouncementDto> {
    const received = await this.dataSource.getRepository(Notification).existsBy({
      userId: user.id,
      type: NotificationType.ANNOUNCEMENT,
      targetId: id,
    });
    const announcement = received
      ? await this.dataSource.getRepository(Announcement).findOneBy({ id })
      : null;
    if (!announcement) throw new NotFoundException();
    const { title, body, publishedAt } = announcement;
    return { id, title, body, publishedAt };
  }

  /** Mensaje del admin a un usuario (FI §19): una notificación, auditada. */
  async message(admin: AuthUser, userId: string, dto: AdminMessageDto): Promise<void> {
    const created = await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOneBy({ id: userId });
      if (!user || user.role === UserRole.ADMIN) throw new NotFoundException();
      const notification = await this.notifications.create(manager, {
        userId,
        type: NotificationType.ADMIN_MESSAGE,
        title: dto.title,
        body: dto.body,
        targetType: null,
        targetId: null,
      });
      await this.audit.record(
        {
          actorId: admin.id,
          action: 'ADMIN_MESSAGE_SENT',
          targetType: 'USER',
          targetId: userId,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
      return notification;
    });
    this.notifications.deliver([created]);
  }
}
