import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { type AuthConfig, authConfig } from '../config/auth.config';
import { NeighborhoodsService } from '../locations/neighborhoods.service';
import { Profession } from '../professions/entities/profession.entity';
import { ProfessionalProfession } from './entities/professional-profession.entity';
import { ProfessionalProfile } from './entities/professional-profile.entity';
import { ProfessionalServiceArea } from './entities/professional-service-area.entity';

/** Zona de trabajo pedida: un barrio por nombre, o toda la localidad si no hay nombre (ADR 0010). */
export interface ServiceAreaInput {
  localityId: string;
  neighborhoodName?: string;
}

/**
 * Perfil profesional: alta (registro o cambio de rol), reactivación y desactivación. Todo corre en
 * la transacción del llamador. Devuelve los ids de barrios nuevos para que el llamador registre
 * quién los cargó.
 */
@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly neighborhoods: NeighborhoodsService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async createProfile(
    manager: EntityManager,
    userId: string,
    professionId: string | undefined,
    serviceAreas: ServiceAreaInput[],
  ): Promise<string[]> {
    const profession = await manager
      .getRepository(Profession)
      .findOneBy({ id: professionId, active: true });
    if (!profession) {
      throw new BadRequestException({
        code: 'INVALID_PROFESSION',
        message: 'La profesión no existe.',
      });
    }
    const profile = manager.getRepository(ProfessionalProfile).create({ userId });
    await manager.getRepository(ProfessionalProfile).insert(profile);
    await manager.getRepository(ProfessionalProfession).insert({
      professionalId: profile.id,
      professionId: profession.id,
      isPrimary: true,
    });
    return this.replaceServiceAreas(manager, profile.id, serviceAreas);
  }

  /** Perfil inactivo de un usuario que vuelve a ser profesional. Null si nunca tuvo uno. */
  async reactivate(manager: EntityManager, userId: string): Promise<ProfessionalProfile | null> {
    const profiles = manager.getRepository(ProfessionalProfile);
    const profile = await profiles.findOneBy({ userId });
    if (!profile) return null;
    await profiles.update(profile.id, { deactivatedAt: null });
    return profile;
  }

  /** Deja el perfil inactivo (no se borra: conserva profesiones, zonas e historial). */
  async deactivate(manager: EntityManager, userId: string): Promise<void> {
    await manager
      .getRepository(ProfessionalProfile)
      .update({ userId, deactivatedAt: IsNull() }, { deactivatedAt: new Date() });
  }

  /**
   * Reemplaza las zonas (ADR 0010): sin repetidas y, si una localidad se cubre completa, se
   * descartan sus barrios sueltos. Entre 1 y MAX_SERVICE_AREAS zonas.
   */
  async replaceServiceAreas(
    manager: EntityManager,
    professionalId: string,
    input: ServiceAreaInput[],
  ): Promise<string[]> {
    const wholeLocalities = new Set(
      input.filter((area) => !area.neighborhoodName).map((area) => area.localityId),
    );
    const zones = new Map<string, { localityId: string; neighborhoodId: string | null }>();
    const created: string[] = [];
    for (const localityId of wholeLocalities) {
      await this.neighborhoods.assertLocality(manager, localityId);
      zones.set(`${localityId}:*`, { localityId, neighborhoodId: null });
    }
    for (const area of input) {
      if (!area.neighborhoodName || wholeLocalities.has(area.localityId)) continue;
      const resolved = await this.neighborhoods.resolve(
        manager,
        area.localityId,
        area.neighborhoodName,
      );
      zones.set(`${area.localityId}:${resolved.neighborhood.id}`, {
        localityId: area.localityId,
        neighborhoodId: resolved.neighborhood.id,
      });
      if (resolved.created) created.push(resolved.neighborhood.id);
    }
    if (zones.size === 0 || zones.size > this.config.maxServiceAreas) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE_AREAS',
        message: `Elegí entre 1 y ${this.config.maxServiceAreas} zonas de trabajo.`,
      });
    }
    const areas = manager.getRepository(ProfessionalServiceArea);
    await areas.delete({ professionalId });
    await areas.insert([...zones.values()].map((zone) => ({ professionalId, ...zone })));
    return created;
  }
}
