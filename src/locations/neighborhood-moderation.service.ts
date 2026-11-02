import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import type {
  AdminNeighborhoodDto,
  AdminNeighborhoodListDto,
  ListNeighborhoodsQueryDto,
} from './dto/neighborhood-admin.dto';
import { Neighborhood, NeighborhoodStatus } from './entities/neighborhood.entity';
import { neighborhoodNameProblem, normalizeNeighborhoodName } from './neighborhood-name';

const alreadyMerged = () =>
  new ConflictException({
    code: 'NEIGHBORHOOD_MERGED',
    message: 'Ese barrio ya se fusionó con otro.',
  });

/**
 * Moderación de barrios cargados por usuarios (ADR 0010): aprobar, renombrar y fusionar. Cada
 * acción bloquea las filas involucradas y queda auditada en la misma transacción.
 */
@Injectable()
export class NeighborhoodModerationService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async list(query: ListNeighborhoodsQueryDto): Promise<AdminNeighborhoodListDto> {
    const builder = this.dataSource
      .getRepository(Neighborhood)
      .createQueryBuilder('n')
      .where('n.status = :status', { status: query.status });
    if (query.localityId) {
      builder.andWhere('n.localityId = :localityId', { localityId: query.localityId });
    }
    if (query.search) {
      // Solo [a-z0-9 ]: no puede traer comodines de LIKE.
      const needle = normalizeNeighborhoodName(query.search);
      builder.andWhere('n.normalizedName LIKE :pattern', { pattern: `%${needle}%` });
    }
    const [rows, total] = await builder
      .orderBy('n.createdAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const usage = await this.usageOf(rows.map((row) => row.id));
    return {
      data: rows.map((row) => this.toDto(row, usage)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** PENDING → APPROVED: desde ahora aparece en el autocompletado y en los filtros públicos. */
  async approve(admin: AuthUser, id: string, reason?: string): Promise<AdminNeighborhoodDto> {
    return this.dataSource.transaction(async (manager) => {
      const [neighborhood] = await this.lock(manager, [id]);
      if (neighborhood.status === NeighborhoodStatus.MERGED) throw alreadyMerged();
      if (neighborhood.status === NeighborhoodStatus.APPROVED) {
        throw new ConflictException({
          code: 'NEIGHBORHOOD_ALREADY_APPROVED',
          message: 'El barrio ya está aprobado.',
        });
      }
      await this.markReviewed(manager, admin, id, { status: NeighborhoodStatus.APPROVED });
      await this.record(manager, admin, 'NEIGHBORHOOD_APPROVED', id, reason);
      return this.reload(manager, id);
    });
  }

  /**
   * Corrige el nombre que se muestra. Si el nombre nuevo ya existe en la localidad (como barrio o
   * alias), responde 409: lo que corresponde es fusionarlos.
   */
  async rename(
    admin: AuthUser,
    id: string,
    rawName: string,
    reason?: string,
  ): Promise<AdminNeighborhoodDto> {
    const problem = neighborhoodNameProblem(rawName);
    if (problem) throw new BadRequestException({ code: 'INVALID_NEIGHBORHOOD', message: problem });
    const name = rawName.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeNeighborhoodName(name);

    return this.dataSource.transaction(async (manager) => {
      const [neighborhood] = await this.lock(manager, [id]);
      if (neighborhood.status === NeighborhoodStatus.MERGED) throw alreadyMerged();
      const clash = await manager.getRepository(Neighborhood).findOneBy({
        localityId: neighborhood.localityId,
        normalizedName,
      });
      if (clash && clash.id !== id) {
        throw new ConflictException({
          code: 'NEIGHBORHOOD_NAME_TAKEN',
          message: `Ya existe "${clash.name}" en esa localidad. Fusioná los barrios en lugar de renombrar.`,
        });
      }
      await this.markReviewed(manager, admin, id, { name, normalizedName });
      await this.record(manager, admin, 'NEIGHBORHOOD_RENAMED', id, reason, {
        from: neighborhood.name,
        to: name,
      });
      return this.reload(manager, id);
    });
  }

  /**
   * Fusiona `id` en `targetId` (aprobado, misma localidad): mueve a los clientes y las zonas de
   * trabajo (sin duplicar zonas de un mismo profesional) y deja `id` como alias del destino, así
   * quien vuelva a escribir ese nombre cae en el barrio correcto.
   */
  async merge(
    admin: AuthUser,
    id: string,
    targetId: string,
    reason?: string,
  ): Promise<AdminNeighborhoodDto> {
    if (id === targetId) {
      throw new BadRequestException({
        code: 'INVALID_MERGE',
        message: 'Un barrio no se puede fusionar consigo mismo.',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lock(manager, [id, targetId]);
      const [source, target] = locked[0].id === id ? locked : [locked[1], locked[0]];
      if (source.status === NeighborhoodStatus.MERGED) throw alreadyMerged();
      if (target.status !== NeighborhoodStatus.APPROVED) {
        throw new ConflictException({
          code: 'TARGET_NOT_APPROVED',
          message: 'Solo se puede fusionar en un barrio aprobado.',
        });
      }
      if (source.localityId !== target.localityId) {
        throw new BadRequestException({
          code: 'INVALID_MERGE',
          message: 'Los barrios tienen que ser de la misma localidad.',
        });
      }

      const residents = await this.affected(
        manager.query(
          `UPDATE users SET neighborhood_id = $2, updated_at = now() WHERE neighborhood_id = $1`,
          [id, targetId],
        ),
      );
      // Profesionales que ya trabajan en el destino: su zona duplicada se borra.
      await manager.query(
        `DELETE FROM professional_service_areas s
          WHERE s.neighborhood_id = $1
            AND EXISTS (SELECT 1 FROM professional_service_areas t
                         WHERE t.professional_id = s.professional_id
                           AND t.locality_id = s.locality_id
                           AND t.neighborhood_id = $2)`,
        [id, targetId],
      );
      const serviceAreas = await this.affected(
        manager.query(
          `UPDATE professional_service_areas SET neighborhood_id = $2 WHERE neighborhood_id = $1`,
          [id, targetId],
        ),
      );
      // Las fusiones mantienen un solo salto: los alias del barrio fusionado apuntan al destino.
      await manager
        .getRepository(Neighborhood)
        .update({ mergedIntoId: id }, { mergedIntoId: targetId });
      await this.markReviewed(manager, admin, id, {
        status: NeighborhoodStatus.MERGED,
        mergedIntoId: targetId,
      });
      await this.record(manager, admin, 'NEIGHBORHOOD_MERGED', id, reason, {
        into: targetId,
        residents,
        serviceAreas,
      });
      return this.reload(manager, id);
    });
  }

  // ---------------------------------------------------------------------------------------------

  /** Bloquea las filas en orden de id (dos fusiones cruzadas no se bloquean entre sí). */
  private async lock(manager: EntityManager, ids: string[]): Promise<Neighborhood[]> {
    const rows = await manager.getRepository(Neighborhood).find({
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (rows.length !== new Set(ids).size) {
      throw new NotFoundException({
        code: 'NEIGHBORHOOD_NOT_FOUND',
        message: 'El barrio no existe.',
      });
    }
    return rows;
  }

  private async markReviewed(
    manager: EntityManager,
    admin: AuthUser,
    id: string,
    changes: Partial<Neighborhood>,
  ): Promise<void> {
    await manager
      .getRepository(Neighborhood)
      .update(id, { ...changes, reviewedById: admin.id, reviewedAt: new Date() });
  }

  private async reload(manager: EntityManager, id: string): Promise<AdminNeighborhoodDto> {
    const row = await manager.getRepository(Neighborhood).findOneByOrFail({ id });
    return this.toDto(row, await this.usageOf([id], manager));
  }

  /** `UPDATE` con `manager.query` devuelve `[filas, cantidad]`. */
  private async affected(result: Promise<unknown>): Promise<number> {
    const value = (await result) as [unknown, number];
    return value[1];
  }

  private async usageOf(
    ids: string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, { residents: number; serviceAreas: number }>> {
    const usage = new Map<string, { residents: number; serviceAreas: number }>();
    if (!ids.length) return usage;
    const rows: Array<{ id: string; residents: string; service_areas: string }> =
      await manager.query(
        `SELECT n.id,
              (SELECT count(*) FROM users u WHERE u.neighborhood_id = n.id) AS residents,
              (SELECT count(*) FROM professional_service_areas s WHERE s.neighborhood_id = n.id)
                AS service_areas
         FROM neighborhoods n
        WHERE n.id = ANY($1::uuid[])`,
        [ids],
      );
    for (const row of rows) {
      usage.set(row.id, {
        residents: Number(row.residents),
        serviceAreas: Number(row.service_areas),
      });
    }
    return usage;
  }

  private toDto(
    row: Neighborhood,
    usage: Map<string, { residents: number; serviceAreas: number }>,
  ): AdminNeighborhoodDto {
    return {
      id: row.id,
      localityId: row.localityId,
      name: row.name,
      normalizedName: row.normalizedName,
      status: row.status,
      mergedIntoId: row.mergedIntoId,
      createdByUserId: row.createdByUserId,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      usage: usage.get(row.id) ?? { residents: 0, serviceAreas: 0 },
    };
  }

  private record(
    manager: EntityManager,
    admin: AuthUser,
    action: string,
    targetId: string,
    reason: string | undefined,
    metadata: Record<string, string | number> = {},
  ): Promise<void> {
    return this.audit.record(
      {
        actorId: admin.id,
        action,
        targetType: 'NEIGHBORHOOD',
        targetId,
        reason: reason ?? null,
        result: 'SUCCESS',
        metadata,
      },
      manager,
    );
  }
}
