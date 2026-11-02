import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Locality } from './entities/locality.entity';
import { Neighborhood, NeighborhoodStatus } from './entities/neighborhood.entity';
import {
  displayNeighborhoodName,
  neighborhoodNameProblem,
  normalizeNeighborhoodName,
} from './neighborhood-name';

export interface ResolvedNeighborhood {
  neighborhood: Neighborhood;
  /** true si se creó en esta llamada (queda PENDING hasta que lo revise el admin). */
  created: boolean;
}

const AUTOCOMPLETE_LIMIT = 10;

@Injectable()
export class NeighborhoodsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Autocompletado público: SOLO barrios aprobados (los pendientes no se exponen, ADR 0010). */
  searchApproved(localityId: string, search: string): Promise<Neighborhood[]> {
    const needle = normalizeNeighborhoodName(search);
    return (
      this.dataSource
        .getRepository(Neighborhood)
        .createQueryBuilder('n')
        .where('n.localityId = :localityId', { localityId })
        .andWhere('n.status = :status', { status: NeighborhoodStatus.APPROVED })
        // `needle` solo tiene [a-z0-9 ]: no puede traer comodines de LIKE.
        .andWhere('n.normalizedName LIKE :pattern', { pattern: `%${needle}%` })
        .orderBy('n.name', 'ASC')
        .limit(AUTOCOMPLETE_LIMIT)
        .getMany()
    );
  }

  /**
   * Devuelve el barrio con ese nombre en la localidad o lo crea como PENDING. Si coincide con un
   * barrio fusionado, devuelve el destino de la fusión (los fusionados funcionan como alias).
   * Debe correr dentro de la transacción del llamador.
   */
  async resolve(
    manager: EntityManager,
    localityId: string,
    rawName: string,
  ): Promise<ResolvedNeighborhood> {
    const problem = neighborhoodNameProblem(rawName);
    if (problem) {
      throw new BadRequestException({ code: 'INVALID_NEIGHBORHOOD', message: problem });
    }
    await this.assertLocality(manager, localityId);

    const normalizedName = normalizeNeighborhoodName(rawName);
    const inserted: Array<{ id: string }> = await manager.query(
      `INSERT INTO neighborhoods (locality_id, name, normalized_name, status)
       VALUES ($1, $2, $3, 'PENDING')
       ON CONFLICT (locality_id, normalized_name) DO NOTHING
       RETURNING id`,
      [localityId, displayNeighborhoodName(rawName), normalizedName],
    );
    const repository = manager.getRepository(Neighborhood);
    const row = await repository.findOneByOrFail(
      inserted[0] ? { id: inserted[0].id } : { localityId, normalizedName },
    );
    if (row.status !== NeighborhoodStatus.MERGED || !row.mergedIntoId) {
      return { neighborhood: row, created: Boolean(inserted[0]) };
    }
    // Las fusiones mantienen un solo salto: el destino nunca es otro alias.
    return {
      neighborhood: await repository.findOneByOrFail({ id: row.mergedIntoId }),
      created: false,
    };
  }

  /** La localidad existe y está activa (las localidades las administra solo el admin). */
  async assertLocality(manager: EntityManager, localityId: string): Promise<void> {
    const exists = await manager.getRepository(Locality).existsBy({ id: localityId, active: true });
    if (!exists) {
      throw new BadRequestException({
        code: 'INVALID_LOCALITY',
        message: 'La localidad no existe.',
      });
    }
  }

  /** Registra quién cargó un barrio recién creado (para moderación). */
  async setCreator(manager: EntityManager, neighborhoodId: string, userId: string): Promise<void> {
    await manager
      .getRepository(Neighborhood)
      .update({ id: neighborhoodId }, { createdByUserId: userId });
  }
}
