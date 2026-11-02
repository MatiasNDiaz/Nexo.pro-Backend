import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { NeighborhoodsService } from '../../locations/neighborhoods.service';
import { ProfessionalProfession } from '../../professionals/entities/professional-profession.entity';
import { ProfessionalProfile } from '../../professionals/entities/professional-profile.entity';
import { ProfessionalServiceArea } from '../../professionals/entities/professional-service-area.entity';
import { Profession } from '../../professions/entities/profession.entity';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { AuthEvents, TokenMailEvent } from '../auth.events';
import { RegisterDto, ServiceAreaInputDto } from '../dto/register.dto';
import { OneTimeTokenType } from '../entities/one-time-token.entity';
import { OneTimeTokensService } from './one-time-tokens.service';
import { PasswordService } from './password.service';

/** Respuesta idéntica exista o no el email: no revela qué cuentas existen (plan §9.9). */
export const REGISTER_MESSAGE =
  'Si los datos son válidos, te enviamos un email para confirmar tu cuenta.';

type Outcome = { kind: 'CREATED'; user: User; token: string } | { kind: 'EXISTS' };

const isUniqueEmailViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string; constraint?: string }).code === '23505' &&
  (error.driverError as { constraint?: string }).constraint === 'uq_users_email';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly oneTimeTokens: OneTimeTokensService,
    private readonly neighborhoods: NeighborhoodsService,
    private readonly events: EventEmitter2,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    this.assertRoleFields(dto);
    this.passwords.assertAcceptable(dto.password, { role: dto.role, email: dto.email });
    // Se hashea siempre (también si el email existe) para que el tiempo de respuesta no lo delate.
    const passwordHash = await this.passwords.hash(dto.password);

    let outcome: Outcome;
    try {
      outcome = await this.dataSource.transaction((manager) =>
        this.createAccount(manager, dto, passwordHash),
      );
    } catch (error) {
      // Dos registros simultáneos con el mismo email: el índice único deja pasar uno.
      if (!isUniqueEmailViolation(error)) throw error;
      outcome = { kind: 'EXISTS' };
    }

    if (outcome.kind === 'EXISTS') {
      await this.events.emitAsync(AuthEvents.ALREADY_REGISTERED, { email: dto.email });
      return;
    }
    const event: TokenMailEvent = {
      email: outcome.user.email,
      firstName: outcome.user.firstName,
      token: outcome.token,
    };
    await this.events.emitAsync(AuthEvents.EMAIL_VERIFICATION_REQUESTED, event);
  }

  private async createAccount(
    manager: EntityManager,
    dto: RegisterDto,
    passwordHash: string,
  ): Promise<Outcome> {
    const users = manager.getRepository(User);
    if (await users.existsBy({ email: dto.email })) return { kind: 'EXISTS' };

    const createdNeighborhoods: string[] = [];
    let neighborhoodId: string | null = null;
    if (dto.role === UserRole.CUSTOMER && dto.neighborhood) {
      const resolved = await this.neighborhoods.resolve(
        manager,
        dto.neighborhood.localityId,
        dto.neighborhood.name,
      );
      neighborhoodId = resolved.neighborhood.id;
      if (resolved.created) createdNeighborhoods.push(resolved.neighborhood.id);
    }

    const user = users.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
      status: AccountStatus.PENDING_VERIFICATION,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      neighborhoodId,
    });
    await users.insert(user);

    if (dto.role === UserRole.PROFESSIONAL) {
      createdNeighborhoods.push(...(await this.createProfessional(manager, user, dto)));
    }
    for (const id of createdNeighborhoods)
      await this.neighborhoods.setCreator(manager, id, user.id);

    const token = await this.oneTimeTokens.issue(
      user.id,
      OneTimeTokenType.EMAIL_VERIFY,
      this.config.ttlSec.emailVerification,
      manager,
    );
    await this.audit.record(
      {
        actorId: user.id,
        action: 'USER_REGISTERED',
        targetType: 'USER',
        targetId: user.id,
        reason: null,
        result: 'SUCCESS',
        metadata: { role: user.role, newNeighborhoods: createdNeighborhoods.length },
      },
      manager,
    );
    return { kind: 'CREATED', user, token };
  }

  /** Perfil mínimo + profesión principal + zonas de trabajo. Devuelve los barrios creados. */
  private async createProfessional(
    manager: EntityManager,
    user: User,
    dto: RegisterDto,
  ): Promise<string[]> {
    const profession = await manager
      .getRepository(Profession)
      .findOneBy({ id: dto.professionId, active: true });
    if (!profession) {
      throw new BadRequestException({
        code: 'INVALID_PROFESSION',
        message: 'La profesión no existe.',
      });
    }
    const profile = manager.getRepository(ProfessionalProfile).create({ userId: user.id });
    await manager.getRepository(ProfessionalProfile).insert(profile);
    await manager.getRepository(ProfessionalProfession).insert({
      professionalId: profile.id,
      professionId: profession.id,
      isPrimary: true,
    });

    const { zones, created } = await this.resolveServiceAreas(manager, dto.serviceAreas ?? []);
    await manager
      .getRepository(ProfessionalServiceArea)
      .insert(zones.map((zone) => ({ professionalId: profile.id, ...zone })));
    return created;
  }

  /**
   * Resuelve las zonas (ADR 0010): sin repetidas y, si una localidad se cubre completa, se descartan
   * sus barrios sueltos. Entre 1 y MAX_SERVICE_AREAS zonas.
   */
  private async resolveServiceAreas(manager: EntityManager, input: ServiceAreaInputDto[]) {
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
    return { zones: [...zones.values()], created };
  }

  /** Cada rol manda solo sus datos: nada de mezclar barrio de cliente con zonas de profesional. */
  private assertRoleFields(dto: RegisterDto): void {
    const isCustomer = dto.role === UserRole.CUSTOMER;
    const misplaced = isCustomer
      ? dto.professionId !== undefined || dto.serviceAreas !== undefined
      : dto.neighborhood !== undefined;
    if (misplaced) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Hay datos que no corresponden al rol elegido.',
        details: [],
      });
    }
  }
}
