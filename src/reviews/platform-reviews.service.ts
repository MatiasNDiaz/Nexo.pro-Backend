import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import type {
  AdminPlatformReviewsQueryDto,
  PlatformReviewDto,
  PlatformReviewInputDto,
  PlatformReviewPageDto,
} from './dto/reviews.dto';
import { PlatformReview } from './entities/review.entity';
import { displayName } from './review-rules';

/**
 * Opiniones sobre la plataforma (ADR 0028): una por usuario. Solo se ven en público las que publica
 * el admin; editar una publicada la vuelve a dejar sin publicar.
 */
@Injectable()
export class PlatformReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async mine(user: AuthUser): Promise<PlatformReviewDto | null> {
    const row = await this.dataSource
      .getRepository(PlatformReview)
      .findOne({ where: { userId: user.id }, relations: { user: true } });
    return row ? this.view(row) : null;
  }

  async upsert(user: AuthUser, dto: PlatformReviewInputDto): Promise<PlatformReviewDto> {
    await this.dataSource.query(
      `INSERT INTO platform_reviews (user_id, rating, comment) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
             published_at = NULL, updated_at = now()`,
      [user.id, dto.rating, dto.comment ?? null],
    );
    return (await this.mine(user))!;
  }

  async remove(user: AuthUser): Promise<void> {
    const result = await this.dataSource.getRepository(PlatformReview).delete({ userId: user.id });
    if (!result.affected) throw new NotFoundException();
  }

  /** Públicas: solo las publicadas, de cuentas que siguen existiendo. */
  async published(page: number, limit: number): Promise<PlatformReviewPageDto> {
    return this.page({ publishedAt: Not(IsNull()), user: { deletedAt: IsNull() } }, page, limit);
  }

  async adminList(query: AdminPlatformReviewsQueryDto): Promise<PlatformReviewPageDto> {
    return this.page(
      query.published === undefined
        ? {}
        : { publishedAt: query.published ? Not(IsNull()) : IsNull() },
      query.page,
      query.limit,
    );
  }

  async setPublished(admin: AuthUser, id: string, publish: boolean): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .getRepository(PlatformReview)
        .update(id, { publishedAt: publish ? new Date() : null });
      if (!result.affected) throw new NotFoundException();
      await this.audit.record(
        {
          actorId: admin.id,
          action: publish ? 'PLATFORM_REVIEW_PUBLISHED' : 'PLATFORM_REVIEW_UNPUBLISHED',
          targetType: 'PLATFORM_REVIEW',
          targetId: id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
    });
  }

  private async page(
    where: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<PlatformReviewPageDto> {
    const [rows, total] = await this.dataSource.getRepository(PlatformReview).findAndCount({
      where,
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map((row) => this.view(row)), page, limit, total };
  }

  private view(row: PlatformReview): PlatformReviewDto {
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      author: { displayName: row.user ? displayName(row.user) : 'Usuario eliminado' },
      published: row.publishedAt !== null,
      createdAt: row.createdAt,
    };
  }
}
