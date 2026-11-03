import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import { ContentStatus } from '../common/content-status';
import { moderateContent } from '../common/moderate-content';
import { CatalogService } from '../catalog/catalog.service';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { ServiceContract } from '../requests/entities/requests.entities';
import { ContractStatus } from '../requests/request.enums';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { subscriptionRequired } from '../uploads/uploads.service';
import type {
  CreateReviewDto,
  OwnReviewDto,
  PublicReviewDto,
  ReviewPageDto,
  UpdateReviewDto,
} from './dto/reviews.dto';
import { Review } from './entities/review.entity';
import { COUNTED_REVIEW, displayName, reviewWindowEnd } from './review-rules';

export const ReviewEvents = {
  /** Reseña nueva (después del commit): moderación revisa las señales de alerta (ADR 0029). */
  CREATED: 'reviews.created',
} as const;

export interface ReviewCreatedEvent {
  professionalId: string;
}

const notFound = () =>
  new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'La reseña no existe.' });

/**
 * Reseñas de contrataciones terminadas (ADR 0028): una por contratación, dentro de los 30 días de
 * terminada (crear y editar); borrar, siempre. El profesional responde en público.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly catalog: CatalogService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly events: EventEmitter2,
  ) {}

  async create(customer: AuthUser, dto: CreateReviewDto, now = new Date()): Promise<OwnReviewDto> {
    const created: Notification[] = [];
    const review = await this.dataSource.transaction(async (manager) => {
      const contract = await manager.getRepository(ServiceContract).findOne({
        where: { id: dto.contractId, customerId: customer.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'La contratación no existe.',
        });
      }
      if (contract.status !== ContractStatus.COMPLETED || !contract.completedAt) {
        throw new ConflictException({
          code: 'CONTRACT_NOT_COMPLETED',
          message: 'Podés reseñar cuando el profesional marque el trabajo como terminado.',
        });
      }
      this.assertWindow(contract.completedAt, now);
      const repository = manager.getRepository(Review);
      if (await repository.existsBy({ contractId: contract.id, deletedAt: IsNull() })) {
        throw new ConflictException({
          code: 'REVIEW_EXISTS',
          message: 'Ya reseñaste esta contratación. Podés editar tu reseña.',
        });
      }
      const row = repository.create({
        contractId: contract.id,
        customerId: customer.id,
        professionalId: contract.professionalId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      });
      await repository.insert(row);
      created.push(
        await this.notifications.create(manager, {
          userId: contract.professionalId,
          type: NotificationType.REVIEW_RECEIVED,
          title: 'Recibiste una reseña',
          body: `Te calificaron con ${dto.rating} ${dto.rating === 1 ? 'estrella' : 'estrellas'}.`,
          targetType: NotificationTarget.REVIEW,
          targetId: row.id,
        }),
      );
      return row;
    });
    this.notifications.deliver(created);
    const event: ReviewCreatedEvent = { professionalId: review.professionalId };
    await this.events.emitAsync(ReviewEvents.CREATED, event);
    return this.own(review.id);
  }

  async update(
    customer: AuthUser,
    id: string,
    dto: UpdateReviewDto,
    now = new Date(),
  ): Promise<OwnReviewDto> {
    await this.dataSource.transaction(async (manager) => {
      const review = await this.authored(manager, customer.id, id);
      const contract = await manager
        .getRepository(ServiceContract)
        .findOneByOrFail({ id: review.contractId });
      this.assertWindow(contract.completedAt!, now);
      await manager.getRepository(Review).update(review.id, {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
        editedAt: now,
      });
    });
    return this.own(id);
  }

  /** Borrar se puede siempre (ADR 0028). Queda la fila para moderación, fuera de la vista. */
  async remove(customer: AuthUser, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const review = await this.authored(manager, customer.id, id);
      await manager.getRepository(Review).update(review.id, { deletedAt: new Date() });
    });
  }

  /** Respuesta pública del profesional (una; mandarla de nuevo la reemplaza). */
  async reply(pro: AuthUser, id: string, body: string | null): Promise<OwnReviewDto> {
    if (!(await this.subscriptions.livePlan(pro.id))) throw subscriptionRequired();
    const created: Notification[] = [];
    await this.dataSource.transaction(async (manager) => {
      const review = await manager.getRepository(Review).findOne({
        where: { id, professionalId: pro.id, deletedAt: IsNull(), status: ContentStatus.VISIBLE },
        lock: { mode: 'pessimistic_write' },
      });
      if (!review) throw notFound();
      await manager
        .getRepository(Review)
        .update(review.id, { replyBody: body, repliedAt: body ? new Date() : null });
      if (body && !review.replyBody) {
        created.push(
          await this.notifications.create(manager, {
            userId: review.customerId,
            type: NotificationType.REVIEW_REPLIED,
            title: 'Respondieron tu reseña',
            body: 'El profesional respondió tu reseña.',
            targetType: NotificationTarget.REVIEW,
            targetId: review.id,
          }),
        );
      }
    });
    this.notifications.deliver(created);
    return this.own(id);
  }

  async mine(customer: AuthUser): Promise<OwnReviewDto[]> {
    return this.ownList({ customerId: customer.id });
  }

  async received(pro: AuthUser): Promise<OwnReviewDto[]> {
    return this.ownList({ professionalId: pro.id });
  }

  /** Reseñas públicas de un profesional del catálogo, las más recientes primero. */
  async forProfile(slug: string, page: number, limit: number): Promise<ReviewPageDto> {
    const profile = await this.dataSource
      .getRepository(ProfessionalProfile)
      .findOneBy({ slug, deactivatedAt: IsNull() });
    if (!profile || !(await this.catalog.isListed(profile.userId))) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'El perfil no existe.' });
    }
    const where = {
      professionalId: profile.userId,
      status: ContentStatus.VISIBLE,
      deletedAt: IsNull(),
    };
    const rows = await this.dataSource.getRepository(Review).find({
      where,
      relations: { customer: true },
      // El autor puede estar dado de baja: se muestra como "Usuario eliminado".
      withDeleted: true,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const [summary] = await this.dataSource.query<Array<{ average: string | null; count: string }>>(
      `SELECT round(avg(r.rating), 1) AS average, count(*) AS count
         FROM reviews r WHERE r.professional_id = $1 AND ${COUNTED_REVIEW}`,
      [profile.userId],
    );
    return {
      data: rows.map((row) => this.publicView(row)),
      average: summary.average === null ? null : Number(summary.average),
      count: Number(summary.count),
      page,
      limit,
    };
  }

  async adminModerate(admin: AuthUser, id: string, reason: string, hide: boolean): Promise<void> {
    await this.dataSource.transaction((manager) =>
      moderateContent(manager, this.audit, {
        entity: Review,
        targetType: 'REVIEW',
        id,
        adminId: admin.id,
        reason,
        hide,
      }),
    );
  }

  // ---------------------------------------------------------------------------------------------

  private assertWindow(completedAt: Date, now: Date): void {
    if (now > reviewWindowEnd(completedAt)) {
      throw new ConflictException({
        code: 'REVIEW_WINDOW_CLOSED',
        message:
          'Pasaron más de 30 días desde que terminó el trabajo. Solo podés borrar la reseña.',
      });
    }
  }

  private async authored(manager: EntityManager, customerId: string, id: string) {
    const review = await manager.getRepository(Review).findOne({
      where: { id, customerId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!review) throw notFound();
    return review;
  }

  private async own(id: string): Promise<OwnReviewDto> {
    const [review] = await this.ownList({ id });
    if (!review) throw notFound();
    return review;
  }

  private async ownList(where: {
    id?: string;
    customerId?: string;
    professionalId?: string;
  }): Promise<OwnReviewDto[]> {
    const rows = await this.dataSource.getRepository(Review).find({
      where: { ...where, deletedAt: IsNull() },
      relations: { customer: true },
      // El autor puede estar dado de baja: se muestra como "Usuario eliminado".
      withDeleted: true,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const contracts = rows.length
      ? await this.dataSource
          .getRepository(ServiceContract)
          .findBy({ id: In(rows.map((r) => r.contractId)) })
      : [];
    return rows.map((row) => ({
      ...this.publicView(row),
      contractId: row.contractId,
      professionalId: row.professionalId,
      status: row.status,
      hiddenReason: row.hiddenReason,
      editableUntil: reviewWindowEnd(
        contracts.find((c) => c.id === row.contractId)?.completedAt ?? row.createdAt,
      ),
    }));
  }

  private publicView(row: Review): PublicReviewDto {
    const { customer } = row;
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      author: { displayName: customer ? displayName(customer) : 'Usuario eliminado' },
      reply:
        row.replyBody && row.repliedAt ? { body: row.replyBody, repliedAt: row.repliedAt } : null,
      edited: row.editedAt !== null,
      createdAt: row.createdAt,
    };
  }
}
