import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import type { AuthUser } from '../common/decorators';
import { CatalogService } from '../catalog/catalog.service';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { type MarkedAvailableEvent, ProfessionalEvents } from '../professionals/profile.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import type { FavoriteDto } from './dto/favorites.dto';
import { Favorite } from './entities/favorite.entity';

/**
 * Favoritos del cliente (ADR 0028). Se guardan profesionales del catálogo; si después dejan de
 * aparecer, siguen en la lista como "no disponible". El aviso de disponibilidad se manda solo si
 * el plan del profesional lo incluye (Medium y Premium) y él se pone "Disponible" a mano.
 */
@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {}

  async list(customer: AuthUser): Promise<FavoriteDto[]> {
    const favorites = await this.dataSource.getRepository(Favorite).find({
      where: { customerId: customer.id },
      relations: { professional: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    if (!favorites.length) return [];
    const ids = favorites.map((f) => f.professionalId);
    const profiles = await this.dataSource
      .getRepository(ProfessionalProfile)
      .findBy({ userId: In(ids) });
    const avatars = await this.uploads.publicUrls(
      favorites.flatMap((f) => (f.professional?.avatarFileId ? [f.professional.avatarFileId] : [])),
    );
    const result: FavoriteDto[] = [];
    for (const favorite of favorites) {
      const pro = favorite.professional as User;
      const listed = await this.catalog.isListed(pro.id);
      const profile = profiles.find((p) => p.userId === pro.id);
      result.push({
        professionalId: pro.id,
        listed,
        // Sin datos de quien ya no aparece en el catálogo (puede no tener plan o estar suspendido).
        slug: listed ? (profile?.slug ?? null) : null,
        firstName: listed ? pro.firstName : null,
        lastName: listed ? pro.lastName : null,
        businessName: listed ? (profile?.businessName ?? null) : null,
        avatarUrl: listed && pro.avatarFileId ? (avatars.get(pro.avatarFileId) ?? null) : null,
        availabilityAlerts: favorite.availabilityAlerts,
        alertsAvailable: listed && (await this.alertsIncluded(pro.id)),
        createdAt: favorite.createdAt,
      });
    }
    return result;
  }

  /** Guarda (o actualiza) un favorito. Solo profesionales que aparecen en el catálogo. */
  async save(customer: AuthUser, professionalId: string, alerts?: boolean): Promise<void> {
    if (!(await this.catalog.isListed(professionalId))) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_NOT_AVAILABLE',
        message: 'Ese profesional no está disponible.',
      });
    }
    await this.dataSource.query(
      `INSERT INTO favorites (customer_id, professional_id, availability_alerts)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, professional_id) DO UPDATE
         SET availability_alerts = COALESCE($4, favorites.availability_alerts)`,
      [customer.id, professionalId, alerts ?? false, alerts ?? null],
    );
  }

  async setAlerts(customer: AuthUser, professionalId: string, alerts: boolean): Promise<void> {
    const result = await this.dataSource
      .getRepository(Favorite)
      .update({ customerId: customer.id, professionalId }, { availabilityAlerts: alerts });
    if (!result.affected) throw new NotFoundException();
  }

  async remove(customer: AuthUser, professionalId: string): Promise<void> {
    const result = await this.dataSource
      .getRepository(Favorite)
      .delete({ customerId: customer.id, professionalId });
    if (!result.affected) throw new NotFoundException();
  }

  /**
   * Avisa a quienes lo tienen en favoritos con el aviso activado. No repite el aviso si el cliente
   * todavía no leyó el anterior de ese profesional.
   */
  @OnEvent(ProfessionalEvents.MARKED_AVAILABLE, { promisify: true })
  async onMarkedAvailable(event: MarkedAvailableEvent): Promise<void> {
    try {
      if (!(await this.catalog.isListed(event.userId))) return;
      if (!(await this.alertsIncluded(event.userId))) return;
      const favorites = await this.dataSource
        .getRepository(Favorite)
        .findBy({ professionalId: event.userId, availabilityAlerts: true });
      if (!favorites.length) return;
      const pro = await this.dataSource.getRepository(User).findOneByOrFail({ id: event.userId });
      const created: Notification[] = [];
      await this.dataSource.transaction(async (manager) => {
        for (const { customerId } of favorites) {
          const pending = await this.notifications.hasUnread(
            manager,
            customerId,
            NotificationType.PROFESSIONAL_AVAILABLE,
            event.userId,
          );
          if (pending) continue;
          created.push(
            await this.notifications.create(manager, {
              userId: customerId,
              type: NotificationType.PROFESSIONAL_AVAILABLE,
              title: `${pro.firstName} está disponible`,
              body: `${pro.firstName} ${pro.lastName} se puso disponible ahora.`,
              targetType: NotificationTarget.PROFESSIONAL,
              targetId: event.userId,
            }),
          );
        }
      });
      this.notifications.deliver(created);
    } catch (error) {
      // El aviso no debe hacer fallar el cambio de estado del profesional.
      this.logger.error('No se pudieron mandar los avisos de disponibilidad', error as Error);
    }
  }

  private async alertsIncluded(professionalId: string): Promise<boolean> {
    return (await this.subscriptions.livePlan(professionalId))?.availabilityAlerts === true;
  }
}
