import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { NeighborhoodsService } from '../../locations/neighborhoods.service';
import { ProfessionalsService } from '../../professionals/professionals.service';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { AuthEvents, TokenMailEvent } from '../auth.events';
import { RegisterDto } from '../dto/register.dto';
import { OneTimeTokenType } from '../entities/one-time-token.entity';
import { OneTimeTokensService } from './one-time-tokens.service';
import { PasswordService } from './password.service';

/** Respuesta idéntica exista o no el email: no revela qué cuentas existen (plan §9.9). */
export const REGISTER_MESSAGE =
  'Si los datos son válidos, te enviamos un email para confirmar tu cuenta.';

/** Datos de una cuenta nueva, sin la contraseña (con Google no hay). */
export type AccountData = Omit<RegisterDto, 'password'>;

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
    private readonly professionals: ProfessionalsService,
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

  /**
   * Alta de una cuenta con el email ya verificado por Google (ADR 0015): mismos datos obligatorios y
   * misma verificación de identidad que el registro normal, sin contraseña. Corre en la transacción
   * del llamador.
   */
  async createGoogleAccount(manager: EntityManager, data: AccountData): Promise<User> {
    this.assertRoleFields(data);
    return this.insertAccount(manager, data, null, 'GOOGLE');
  }

  private async createAccount(
    manager: EntityManager,
    dto: RegisterDto,
    passwordHash: string,
  ): Promise<Outcome> {
    const users = manager.getRepository(User);
    if (await users.existsBy({ email: dto.email })) return { kind: 'EXISTS' };
    const user = await this.insertAccount(manager, dto, passwordHash, 'PASSWORD');
    const token = await this.oneTimeTokens.issue(
      user.id,
      OneTimeTokenType.EMAIL_VERIFY,
      this.config.ttlSec.emailVerification,
      manager,
    );
    return { kind: 'CREATED', user, token };
  }

  private async insertAccount(
    manager: EntityManager,
    dto: AccountData,
    passwordHash: string | null,
    via: 'PASSWORD' | 'GOOGLE',
  ): Promise<User> {
    const users = manager.getRepository(User);
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
      // Google ya verificó el email (solo se aceptan emails verificados por Google).
      emailVerifiedAt: via === 'GOOGLE' ? new Date() : null,
    });
    await users.insert(user);

    if (dto.role === UserRole.PROFESSIONAL) {
      createdNeighborhoods.push(
        ...(await this.professionals.createProfile(
          manager,
          user.id,
          dto.professionId,
          dto.serviceAreas ?? [],
        )),
      );
    }
    for (const id of createdNeighborhoods)
      await this.neighborhoods.setCreator(manager, id, user.id);

    await this.audit.record(
      {
        actorId: user.id,
        action: 'USER_REGISTERED',
        targetType: 'USER',
        targetId: user.id,
        reason: null,
        result: 'SUCCESS',
        metadata: { role: user.role, newNeighborhoods: createdNeighborhoods.length, via },
      },
      manager,
    );
    return user;
  }

  /** Cada rol manda solo sus datos: nada de mezclar barrio de cliente con zonas de profesional. */
  private assertRoleFields(dto: AccountData): void {
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
