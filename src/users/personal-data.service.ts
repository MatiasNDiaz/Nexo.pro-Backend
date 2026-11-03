import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { Neighborhood } from '../locations/entities/neighborhood.entity';
import { NeighborhoodsService } from '../locations/neighborhoods.service';
import type {
  AdminUpdatePersonalDataDto,
  PersonalDataDto,
  UpdatePersonalDataDto,
} from './dto/personal-data.dto';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from './entities/user.entity';
import { UserRole } from './user.enums';

/**
 * Datos personales (ADR 0021). Teléfono y barrio: cambio inmediato. Nombre y apellido: con la
 * identidad aprobada, quedan en revisión del admin (como la foto, ADR 0019). El admin puede editar
 * los datos de cualquier cliente o profesional, con motivo y auditoría, y su cambio se aplica directo.
 */
@Injectable()
export class PersonalDataService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly identity: IdentityVerificationService,
    private readonly neighborhoods: NeighborhoodsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async get(userId: string): Promise<PersonalDataDto> {
    const user = await this.dataSource.getRepository(User).findOneOrFail({
      where: { id: userId },
      relations: { neighborhood: true },
    });
    return toDto(user, user.neighborhood ?? null);
  }

  async updateOwn(
    authUser: AuthUser,
    dto: UpdatePersonalDataDto,
  ): Promise<PersonalDataDto & { nameUnderReview: boolean }> {
    let nameUnderReview = false;
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lock(manager, authUser.id);
      await this.applyContactData(manager, user, dto, user.id);
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        const base = this.currentName(user);
        nameUnderReview = await this.identity.proposeNameChange(
          manager,
          user,
          dto.firstName ?? base.firstName,
          dto.lastName ?? base.lastName,
        );
      }
    });
    return { ...(await this.get(authUser.id)), nameUnderReview };
  }

  async updateByAdmin(
    admin: AuthUser,
    userId: string,
    dto: AdminUpdatePersonalDataDto,
  ): Promise<PersonalDataDto> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lock(manager, userId);
      if (user.role === UserRole.ADMIN) {
        throw new ConflictException({
          code: 'CANNOT_MODIFY_ADMIN',
          message: 'Esta acción no se puede aplicar a una cuenta de administrador.',
        });
      }
      await this.applyContactData(manager, user, dto, admin.id);
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        await this.identity.applyNameByAdmin(
          manager,
          admin.id,
          user,
          dto.firstName ?? user.firstName,
          dto.lastName ?? user.lastName,
        );
      }
      if (dto.extraInfo !== undefined) {
        if (user.role !== UserRole.CUSTOMER) throw onlyCustomers('extraInfo');
        await manager
          .getRepository(CustomerProfile)
          .upsert({ userId: user.id, extraInfo: dto.extraInfo || null }, ['userId']);
      }
      const fields = ['firstName', 'lastName', 'phone', 'neighborhood', 'extraInfo'].filter(
        (field) => dto[field as keyof AdminUpdatePersonalDataDto] !== undefined,
      );
      // Solo qué campos cambiaron: los valores son datos personales.
      await this.audit.record(
        {
          actorId: admin.id,
          action: 'USER_DATA_UPDATED',
          targetType: 'USER',
          targetId: user.id,
          reason: dto.reason,
          result: 'SUCCESS',
          metadata: { fields: fields.join(',') },
        },
        manager,
      );
    });
    return this.get(userId);
  }

  /** Teléfono y barrio (solo clientes): cambio inmediato. */
  private async applyContactData(
    manager: EntityManager,
    user: User,
    dto: UpdatePersonalDataDto,
    creatorId: string,
  ): Promise<void> {
    if (dto.phone !== undefined) {
      await manager.getRepository(User).update(user.id, { phone: dto.phone });
    }
    if (dto.neighborhood) {
      if (user.role !== UserRole.CUSTOMER) throw onlyCustomers('neighborhood');
      const resolved = await this.neighborhoods.resolve(
        manager,
        dto.neighborhood.localityId,
        dto.neighborhood.name,
      );
      if (resolved.created) {
        await this.neighborhoods.setCreator(manager, resolved.neighborhood.id, creatorId);
      }
      await manager
        .getRepository(User)
        .update(user.id, { neighborhoodId: resolved.neighborhood.id });
    }
  }

  /** El nombre "de partida" para un cambio parcial: el pendiente si hay uno, si no el vigente. */
  private currentName(user: User) {
    return {
      firstName: user.pendingFirstName ?? user.firstName,
      lastName: user.pendingLastName ?? user.lastName,
    };
  }

  private async lock(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
    if (!user) throw new NotFoundException();
    return user;
  }
}

function onlyCustomers(field: string) {
  return new BadRequestException({
    code: 'FIELD_NOT_ALLOWED',
    message: 'Ese dato es solo de clientes.',
    details: [{ field, errors: ['Solo para clientes.'] }],
  });
}

function toDto(user: User, neighborhood: Neighborhood | null): PersonalDataDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    pendingFirstName: user.pendingFirstName,
    pendingLastName: user.pendingLastName,
    phone: user.phone,
    neighborhoodId: user.neighborhoodId,
    neighborhoodName: neighborhood?.name ?? null,
  };
}
