import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import { type AccountDeletionScheduledEvent, AuthEvents } from '../auth/auth.events';
import { SessionRevokeReason } from '../auth/entities/auth-session.entity';
import { OneTimeToken } from '../auth/entities/one-time-token.entity';
import { PasswordService } from '../auth/services/password.service';
import { SessionsService } from '../auth/services/sessions.service';
import type { AuthUser } from '../common/decorators';
import { type AuthConfig, authConfig } from '../config/auth.config';
import { NeighborhoodsService } from '../locations/neighborhoods.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { UploadsService } from '../uploads/uploads.service';
import { accountsDueForAnonymization, anonymizeAccount } from './account-anonymizer';
import { ChangeRoleDto } from './dto/account-admin.dto';
import { User } from './entities/user.entity';
import { isIdentityApproved } from './identity-status';
import { AccountStatus, UserRole } from './user.enums';

/** Una cuenta que no se puede llevar a ese estado desde el actual. */
const invalidTransition = (from: AccountStatus, action: string) =>
  new ConflictException({
    code: 'INVALID_STATE_TRANSITION',
    message: `No se puede ${action} una cuenta en estado ${from}.`,
  });

/**
 * Ciclo de vida de la cuenta (etapa 6, ADR 0007, 0012, 0013 y 0014). Cada acción del admin:
 * bloquea la fila del usuario, valida la transición, revoca las sesiones cuando corresponde y
 * audita con motivo, todo en una transacción. El admin no puede aplicarlas sobre una cuenta ADMIN.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordService,
    private readonly neighborhoods: NeighborhoodsService,
    private readonly professionals: ProfessionalsService,
    private readonly uploads: UploadsService,
    private readonly events: EventEmitter2,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  suspend(admin: AuthUser, userId: string, reason: string): Promise<User> {
    return this.changeStatus(admin, userId, reason, {
      action: 'ACCOUNT_SUSPENDED',
      verb: 'suspender',
      from: [AccountStatus.ACTIVE, AccountStatus.PENDING_VERIFICATION],
      to: () => AccountStatus.SUSPENDED,
      revoke: true,
    });
  }

  ban(admin: AuthUser, userId: string, reason: string): Promise<User> {
    return this.changeStatus(admin, userId, reason, {
      action: 'ACCOUNT_BANNED',
      verb: 'banear',
      from: [AccountStatus.ACTIVE, AccountStatus.PENDING_VERIFICATION, AccountStatus.SUSPENDED],
      to: () => AccountStatus.BANNED,
      revoke: true,
    });
  }

  /**
   * Levanta una suspensión, un baneo o una baja todavía en período de gracia (ADR 0016). Vuelve a
   * ACTIVE solo si la identidad está aprobada; si no, a PENDING_VERIFICATION.
   */
  async restore(admin: AuthUser, userId: string, reason: string): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockTarget(manager, userId);
      const pendingDeletion =
        user.status === AccountStatus.DEACTIVATED && user.deletionScheduledFor;
      const sanctioned =
        user.status === AccountStatus.SUSPENDED || user.status === AccountStatus.BANNED;
      if (!pendingDeletion && !sanctioned) throw invalidTransition(user.status, 'restaurar');

      const status = isIdentityApproved(user)
        ? AccountStatus.ACTIVE
        : AccountStatus.PENDING_VERIFICATION;
      await manager
        .getRepository(User)
        .update(user.id, { status, statusReason: null, deletionScheduledFor: null });
      if (pendingDeletion && user.role === UserRole.PROFESSIONAL) {
        await this.professionals.reactivate(manager, user.id);
      }
      await this.record(manager, admin.id, 'ACCOUNT_RESTORED', user.id, reason, {
        from: user.status,
        to: status,
      });
      return manager.getRepository(User).findOneByOrFail({ id: user.id });
    });
  }

  /** Cuenta comprometida (ADR 0014): cierra todos los dispositivos sin cambiar el estado. */
  async revokeSessions(admin: AuthUser, userId: string, reason: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lockTarget(manager, userId);
      await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.ADMIN_REVOKED, { manager });
      await this.record(manager, admin.id, 'SESSIONS_REVOKED', user.id, reason);
    });
  }

  /**
   * Cambio de rol (ADR 0012): el perfil anterior queda inactivo (no se borra) y las sesiones se
   * revocan para que el nuevo rol rija desde el próximo login.
   */
  async changeRole(admin: AuthUser, userId: string, dto: ChangeRoleDto): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockTarget(manager, userId);
      if (user.status === AccountStatus.DEACTIVATED)
        throw invalidTransition(user.status, 'cambiar el rol de');
      if (user.role === dto.role) {
        throw new ConflictException({ code: 'SAME_ROLE', message: `La cuenta ya es ${dto.role}.` });
      }
      const from = user.role;
      const createdNeighborhoods =
        dto.role === UserRole.CUSTOMER
          ? await this.becomeCustomer(manager, user, dto)
          : await this.becomeProfessional(manager, user, dto);
      for (const id of createdNeighborhoods)
        await this.neighborhoods.setCreator(manager, id, admin.id);

      await manager.getRepository(User).update(user.id, { role: dto.role });
      await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.ROLE_CHANGED, { manager });
      await this.record(manager, admin.id, 'ROLE_CHANGED', user.id, dto.reason, {
        from,
        to: dto.role,
      });
      return manager.getRepository(User).findOneByOrFail({ id: user.id });
    });
  }

  /** Baja por el admin (ADR 0013 y 0016): período de gracia y después anonimización. */
  async deleteByAdmin(admin: AuthUser, userId: string, reason: string): Promise<void> {
    const user = await this.dataSource.transaction(async (manager) => {
      const target = await this.lockTarget(manager, userId);
      await this.scheduleDeletion(manager, target);
      await this.record(manager, admin.id, 'ACCOUNT_DELETION_SCHEDULED', target.id, reason, {
        by: 'ADMIN',
      });
      return manager.getRepository(User).findOneByOrFail({ id: target.id });
    });
    await this.notifyDeletionScheduled(user);
  }

  /**
   * Anonimiza las cuentas cuyo período de gracia venció. Lo corren la tarea diaria
   * (`AccountsPurgeJob`) y el comando `accounts:purge`. Devuelve cuántas cuentas anonimizó.
   */
  async purgeExpiredDeletions(now = new Date()): Promise<number> {
    const due = await accountsDueForAnonymization(this.dataSource.manager, now);
    let purged = 0;
    for (const userId of due) {
      const files = await this.dataSource.transaction(async (manager) => {
        const user = await manager
          .getRepository(User)
          .findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        // Pudo haberse restaurado entre la búsqueda y el bloqueo.
        if (!user?.deletionScheduledFor || user.deletionScheduledFor > now) return null;
        // La foto y los demás archivos son datos personales: se borran del proveedor.
        const detached = await this.uploads.detachAllFrom(manager, user.id);
        await anonymizeAccount(manager, user.id);
        await this.audit.record(
          {
            actorId: null,
            action: 'ACCOUNT_ANONYMIZED',
            targetType: 'USER',
            targetId: user.id,
            reason: null,
            result: 'SUCCESS',
          },
          manager,
        );
        return detached;
      });
      if (!files) continue;
      purged++;
      await this.uploads.deleteFromStorage(files);
    }
    return purged;
  }

  /** Baja de la propia cuenta: exige la contraseña. El admin no puede darse de baja así. */
  async deleteOwn(authUser: AuthUser, password: string): Promise<void> {
    if (authUser.role === UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'ADMIN_CANNOT_SELF_DELETE',
        message: 'La cuenta del admin no se puede dar de baja desde la API.',
      });
    }
    const withPassword = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: authUser.id })
      .getOneOrFail();
    if (!(await this.passwords.verify(withPassword.passwordHash, password))) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'La contraseña no es correcta.',
      });
    }
    const user = await this.dataSource.transaction(async (manager) => {
      const target = await this.lockTarget(manager, authUser.id);
      await this.scheduleDeletion(manager, target);
      await this.record(manager, target.id, 'ACCOUNT_DELETION_SCHEDULED', target.id, null, {
        by: 'SELF',
      });
      return manager.getRepository(User).findOneByOrFail({ id: target.id });
    });
    await this.notifyDeletionScheduled(user);
  }

  private async changeStatus(
    admin: AuthUser,
    userId: string,
    reason: string,
    rule: {
      action: string;
      verb: string;
      from: AccountStatus[];
      to: (user: User) => AccountStatus;
      revoke: boolean;
    },
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockTarget(manager, userId);
      if (!rule.from.includes(user.status)) throw invalidTransition(user.status, rule.verb);
      const status = rule.to(user);
      const restricted = status === AccountStatus.SUSPENDED || status === AccountStatus.BANNED;
      await manager
        .getRepository(User)
        .update(user.id, { status, statusReason: restricted ? reason : null });
      if (rule.revoke) {
        await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.ACCOUNT_SUSPENDED, {
          manager,
        });
      }
      await this.record(manager, admin.id, rule.action, user.id, reason, {
        from: user.status,
        to: status,
      });
      return manager.getRepository(User).findOneByOrFail({ id: user.id });
    });
  }

  private async becomeCustomer(manager: EntityManager, user: User, dto: ChangeRoleDto) {
    const created: string[] = [];
    if (dto.neighborhood) {
      const resolved = await this.neighborhoods.resolve(
        manager,
        dto.neighborhood.localityId,
        dto.neighborhood.name,
      );
      await manager
        .getRepository(User)
        .update(user.id, { neighborhoodId: resolved.neighborhood.id });
      if (resolved.created) created.push(resolved.neighborhood.id);
    } else if (!user.neighborhoodId) {
      throw new BadRequestException({
        code: 'NEIGHBORHOOD_REQUIRED',
        message: 'Para pasar a cliente hace falta el barrio donde vive.',
      });
    }
    await this.professionals.deactivate(manager, user.id);
    return created;
  }

  private async becomeProfessional(manager: EntityManager, user: User, dto: ChangeRoleDto) {
    const previous = await this.professionals.reactivate(manager, user.id);
    if (previous) {
      await this.professionals.grantTrialIfFirst(manager, user.id);
      return dto.serviceAreas
        ? this.professionals.replaceServiceAreas(manager, previous.id, dto.serviceAreas)
        : [];
    }
    if (!dto.professionId || !dto.serviceAreas) {
      throw new BadRequestException({
        code: 'PROFESSIONAL_DATA_REQUIRED',
        message: 'Para pasar a profesional hacen falta la profesión y las zonas de trabajo.',
      });
    }
    return this.professionals.createProfile(manager, user.id, dto.professionId, dto.serviceAreas);
  }

  /**
   * Baja con período de gracia (ADR 0016): la cuenta queda DEACTIVATED (no puede iniciar sesión,
   * el email sigue reservado), con sus datos, hasta `deletionScheduledFor`. Se revocan las
   * sesiones, se anulan los enlaces pendientes y se oculta el perfil profesional.
   */
  private async scheduleDeletion(manager: EntityManager, user: User): Promise<void> {
    if (user.deletionScheduledFor) {
      throw new ConflictException({
        code: 'DELETION_ALREADY_SCHEDULED',
        message: 'La cuenta ya tiene una baja en curso.',
      });
    }
    const days = this.config.accountDeletionGraceDays;
    await manager.getRepository(User).update(user.id, {
      status: AccountStatus.DEACTIVATED,
      statusReason: null,
      deletionScheduledFor: new Date(Date.now() + days * 24 * 3600 * 1000),
    });
    await manager.getRepository(OneTimeToken).delete({ userId: user.id });
    await this.professionals.deactivate(manager, user.id);
    await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.ACCOUNT_DELETED, { manager });
  }

  private async notifyDeletionScheduled(user: User): Promise<void> {
    if (!user.deletionScheduledFor) return;
    const event: AccountDeletionScheduledEvent = {
      email: user.email,
      firstName: user.firstName,
      deletionScheduledFor: user.deletionScheduledFor,
    };
    await this.events.emitAsync(AuthEvents.ACCOUNT_DELETION_SCHEDULED, event);
  }

  /** Bloquea la fila (serializa acciones simultáneas) y rechaza cuentas borradas o de admin. */
  private async lockTarget(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
    if (!user) throw new NotFoundException();
    if (user.role === UserRole.ADMIN) {
      throw new ConflictException({
        code: 'CANNOT_MODIFY_ADMIN',
        message: 'Esta acción no se puede aplicar a una cuenta de administrador.',
      });
    }
    return user;
  }

  private record(
    manager: EntityManager,
    actorId: string,
    action: string,
    targetId: string,
    reason: string | null,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    return this.audit.record(
      { actorId, action, targetType: 'USER', targetId, reason, result: 'SUCCESS', metadata },
      manager,
    );
  }
}
