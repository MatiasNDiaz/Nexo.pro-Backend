import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  Notification,
  type NotificationTarget,
  type NotificationType,
} from './entities/notification.entity';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: NotificationTarget | null;
  targetId: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: NotificationTarget | null;
  targetId: string | null;
  read: boolean;
  createdAt: Date;
}

const toDto = (n: Notification): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  targetType: n.targetType,
  targetId: n.targetId,
  read: n.readAt !== null,
  createdAt: n.createdAt,
});

/**
 * Notificaciones dentro de la app (P-15). Se crean en la transacción del llamador y se avisan por
 * tiempo real después del commit (`deliver`), así no llega un aviso de algo que se revirtió.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(manager: EntityManager, input: NotificationInput): Promise<Notification> {
    const repository = manager.getRepository(Notification);
    const notification = repository.create(input);
    await repository.insert(notification);
    return repository.findOneByOrFail({ id: notification.id });
  }

  /** Avisa por tiempo real (después del commit). */
  deliver(notifications: Notification[]): void {
    for (const n of notifications) this.realtime.emitToUser(n.userId, 'notification:new', toDto(n));
  }

  /** ¿Ya hay una notificación sin leer de ese tipo para ese objeto? (evita una por mensaje). */
  hasUnread(
    manager: EntityManager,
    userId: string,
    type: NotificationType,
    targetId: string,
  ): Promise<boolean> {
    return manager
      .getRepository(Notification)
      .existsBy({ userId, type, targetId, readAt: IsNull() });
  }

  async list(userId: string, page: number, limit: number) {
    const [rows, total] = await this.dataSource.getRepository(Notification).findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map(toDto), page, limit, total, unread: await this.unreadCount(userId) };
  }

  unreadCount(userId: string): Promise<number> {
    return this.dataSource.getRepository(Notification).countBy({ userId, readAt: IsNull() });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const repository = this.dataSource.getRepository(Notification);
    const exists = await repository.existsBy({ id, userId });
    if (!exists) throw new NotFoundException();
    await repository.update({ id, userId, readAt: IsNull() }, { readAt: new Date() });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.dataSource
      .getRepository(Notification)
      .update({ userId, readAt: IsNull() }, { readAt: new Date() });
  }

  /** Marca leídas las de un objeto (al abrir el chat, se leen sus avisos de mensajes nuevos). */
  async markReadFor(userId: string, targetId: string): Promise<void> {
    await this.dataSource
      .getRepository(Notification)
      .update({ userId, targetId, readAt: IsNull() }, { readAt: new Date() });
  }
}
