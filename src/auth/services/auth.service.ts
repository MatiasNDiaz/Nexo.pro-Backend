import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import { AuthUser } from '../../common/decorators';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { CaptchaService } from '../../integrations/abuse/captcha.service';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { AuthEvents, TokenMailEvent, UserMailEvent } from '../auth.events';
import { MfaVerifyDto } from '../dto/auth-requests.dto';
import { SessionRevokeReason } from '../entities/auth-session.entity';
import { OneTimeTokenType } from '../entities/one-time-token.entity';
import { RequestMeta } from '../request-meta';
import { MfaService } from './mfa.service';
import { OneTimeTokensService } from './one-time-tokens.service';
import { PasswordService } from './password.service';
import { IssuedSession, SessionsService } from './sessions.service';

/** Mismo mensaje y código para email inexistente, contraseña incorrecta o cuenta bloqueada. */
export const invalidCredentials = () =>
  new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Email o contraseña incorrectos.',
  });

const invalidToken = () =>
  new BadRequestException({ code: 'INVALID_TOKEN', message: 'El enlace no es válido o venció.' });

/** Bloqueo progresivo por cuenta (plan §9.9): nunca permanente, para no permitir bloquear a otros. */
export function lockMinutesFor(failedAttempts: number): number {
  if (failedAttempts >= 15) return 60;
  if (failedAttempts >= 10) return 15;
  if (failedAttempts >= 5) return 1;
  return 0;
}

export type LoginResult =
  { kind: 'SESSION'; user: User; issued: IssuedSession } | { kind: 'MFA_REQUIRED'; userId: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly oneTimeTokens: OneTimeTokensService,
    private readonly mfa: MfaService,
    private readonly events: EventEmitter2,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly captcha: CaptchaService,
  ) {}

  /**
   * Login con contraseña. Se auditan los intentos (SEG §20.2) con la IP seudonimizada; un email que
   * no existe queda sin usuario asociado (no se guarda el email).
   */
  async login(
    email: string,
    password: string,
    meta: RequestMeta,
    captchaToken?: string,
  ): Promise<LoginResult> {
    // Después de varios fallos desde esta IP, CAPTCHA (si está activado; etapa 12).
    await this.captcha.assertForLogin(meta.ipHash, captchaToken);
    const user = await this.findWithPassword({ email });
    if (!user) {
      // Mismo costo que una verificación real: el tiempo no revela si el email existe.
      await this.passwords.verifyDummy(password);
      await this.loginFailed(null, meta, 'UNKNOWN_EMAIL');
      throw invalidCredentials();
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, password);
    if (this.isLocked(user)) {
      await this.loginFailed(user.id, meta, 'LOCKED');
      throw invalidCredentials();
    }
    if (!passwordOk || user.status === AccountStatus.DEACTIVATED) {
      if (!passwordOk) await this.registerFailedAttempt(user.id, meta);
      await this.loginFailed(user.id, meta, passwordOk ? 'DEACTIVATED' : 'BAD_PASSWORD');
      throw invalidCredentials();
    }

    if (user.role === UserRole.ADMIN) {
      // Contraseña correcta, pero falta el segundo factor: todavía no hay sesión.
      return { kind: 'MFA_REQUIRED', userId: user.id };
    }
    const issued = await this.startSession(user, meta);
    await this.recordLogin(user.id, true, meta, 'PASSWORD');
    return { kind: 'SESSION', user, issued };
  }

  private async loginFailed(userId: string | null, meta: RequestMeta, cause: string) {
    this.captcha.recordLoginFailure(meta.ipHash);
    await this.recordLogin(userId, false, meta, cause);
  }

  /** `LOGIN_SUCCEEDED` / `LOGIN_FAILED` (SEG §20.2). Las alertas de seguridad cuentan los fallidos. */
  async recordLogin(
    userId: string | null,
    success: boolean,
    meta: RequestMeta,
    detail: string,
  ): Promise<void> {
    await this.audit.record({
      actorId: userId,
      action: success ? 'LOGIN_SUCCEEDED' : 'LOGIN_FAILED',
      targetType: 'USER',
      targetId: userId,
      reason: null,
      result: success ? 'SUCCESS' : 'DENIED',
      metadata: { method: success ? detail : 'PASSWORD', ...(!success && { cause: detail }) },
      ipHash: meta.ipHash,
    });
  }

  /**
   * Verifica la contraseña de una cuenta con el mismo bloqueo progresivo que el login (vincular
   * Google con contraseña, ADR 0015). Una cuenta sin contraseña nunca la verifica.
   */
  async verifyPasswordFor(userId: string, password: string): Promise<boolean> {
    const user = await this.findWithPassword({ id: userId });
    if (!user) return this.passwords.verifyDummy(password);
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (this.isLocked(user)) return false;
    if (!ok) await this.registerFailedAttempt(user.id);
    return ok;
  }

  /** Segundo paso del admin. Los códigos fallidos suman al mismo bloqueo progresivo. */
  async verifyMfa(userId: string, proof: MfaVerifyDto, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.findWithPassword({ id: userId });
    if (!user || user.role !== UserRole.ADMIN || user.status === AccountStatus.DEACTIVATED) {
      throw this.invalidMfa();
    }
    if (this.isLocked(user)) throw this.invalidMfa();

    const valid = await this.dataSource.transaction((manager) =>
      this.mfa.verifyAndConsume(manager, user.id, proof),
    );
    if (!valid) {
      await this.registerFailedAttempt(user.id, meta);
      await this.recordLogin(user.id, false, meta, 'BAD_MFA');
      throw this.invalidMfa();
    }
    const issued = await this.startSession(user, meta);
    await this.audit.record({
      actorId: user.id,
      action: proof.recoveryCode ? 'ADMIN_LOGIN_RECOVERY_CODE' : 'ADMIN_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      reason: null,
      result: 'SUCCESS',
      ipHash: meta.ipHash,
    });
    return { kind: 'SESSION', user, issued };
  }

  async currentUser(authUser: AuthUser): Promise<User> {
    return this.dataSource.getRepository(User).findOneByOrFail({ id: authUser.id });
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.oneTimeTokens.consume(token, OneTimeTokenType.EMAIL_VERIFY);
    if (!userId) throw invalidToken();
    await this.dataSource
      .createQueryBuilder()
      .update(User)
      .set({ emailVerifiedAt: () => 'now()' })
      .where('id = :userId AND email_verified_at IS NULL', { userId })
      .execute();
  }

  async resendEmailVerification(authUser: AuthUser): Promise<void> {
    const user = await this.currentUser(authUser);
    if (user.emailVerifiedAt) return;
    const token = await this.oneTimeTokens.issue(
      user.id,
      OneTimeTokenType.EMAIL_VERIFY,
      this.config.ttlSec.emailVerification,
    );
    await this.emitTokenMail(AuthEvents.EMAIL_VERIFICATION_REQUESTED, user, token);
  }

  /** "Olvidé mi contraseña" autoservicio: apagado por ADR 0002 (responde 404 si está apagado). */
  async requestSelfPasswordReset(email: string): Promise<void> {
    if (!this.config.passwordSelfResetEnabled) throw new NotFoundException();
    const user = await this.dataSource.getRepository(User).findOneBy({ email });
    if (!user || user.status === AccountStatus.DEACTIVATED) return;
    await this.issuePasswordReset(user);
  }

  /** ADR 0002: el admin dispara el enlace; nunca ve ni define la contraseña. Motivo auditado. */
  async adminRequestPasswordReset(
    admin: AuthUser,
    targetUserId: string,
    reason: string,
  ): Promise<void> {
    const user = await this.dataSource.getRepository(User).findOneBy({ id: targetUserId });
    if (!user) throw new NotFoundException();
    await this.issuePasswordReset(user, async (manager) =>
      this.audit.record(
        {
          actorId: admin.id,
          action: 'ADMIN_PASSWORD_RESET_REQUESTED',
          targetType: 'USER',
          targetId: user.id,
          reason,
          result: 'SUCCESS',
        },
        manager,
      ),
    );
  }

  /** Usa el enlace del email: contraseña nueva, desbloqueo y cierre de TODAS las sesiones. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.dataSource.transaction(async (manager) => {
      const userId = await this.oneTimeTokens.consume(
        token,
        OneTimeTokenType.PASSWORD_RESET,
        manager,
      );
      if (!userId) throw invalidToken();
      const target = await manager.getRepository(User).findOneByOrFail({ id: userId });
      await this.passwords.assertAcceptable(newPassword, target);
      await this.updatePassword(manager, target.id, newPassword);
      await this.sessions.revokeAllForUser(target.id, SessionRevokeReason.PASSWORD_RESET, {
        manager,
      });
      await this.audit.record(
        {
          actorId: target.id,
          action: 'PASSWORD_RESET_COMPLETED',
          targetType: 'USER',
          targetId: target.id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
      return target;
    });
    await this.emitUserMail(AuthEvents.PASSWORD_CHANGED, user);
  }

  /** Cambio con la contraseña actual: cierra los demás dispositivos y conserva el actual. */
  async changePassword(authUser: AuthUser, current: string, next: string): Promise<void> {
    const user = await this.findWithPassword({ id: authUser.id });
    if (user && user.passwordHash === null) {
      throw new ConflictException({
        code: 'NO_PASSWORD_SET',
        message: 'Tu cuenta todavía no tiene contraseña: creala primero.',
      });
    }
    if (!user || !(await this.passwords.verify(user.passwordHash, current))) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'La contraseña actual no es correcta.',
      });
    }
    await this.passwords.assertAcceptable(next, user);
    await this.dataSource.transaction(async (manager) => {
      await this.updatePassword(manager, user.id, next);
      await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.PASSWORD_CHANGED, {
        exceptFamilyId: authUser.familyId,
        manager,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'PASSWORD_CHANGED',
          targetType: 'USER',
          targetId: user.id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
    });
    await this.emitUserMail(AuthEvents.PASSWORD_CHANGED, user);
  }

  /**
   * Crea la contraseña de una cuenta que entró solo con Google (ADR 0023): exige un inicio de
   * sesión reciente y conserva el dispositivo actual.
   */
  async setPassword(authUser: AuthUser, next: string): Promise<void> {
    const user = await this.findWithPassword({ id: authUser.id });
    if (!user) throw new NotFoundException();
    if (user.passwordHash !== null) {
      throw new ConflictException({
        code: 'PASSWORD_ALREADY_SET',
        message: 'Tu cuenta ya tiene contraseña: usá el cambio de contraseña.',
      });
    }
    await this.sessions.assertRecentLogin(authUser);
    await this.passwords.assertAcceptable(next, user);
    await this.dataSource.transaction(async (manager) => {
      await this.updatePassword(manager, user.id, next);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'PASSWORD_SET',
          targetType: 'USER',
          targetId: user.id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
    });
    await this.emitUserMail(AuthEvents.PASSWORD_CHANGED, user);
  }

  /** Abre un dispositivo nuevo y limpia el bloqueo por intentos (también lo usa el login con Google). */
  async startSession(user: User, meta: RequestMeta): Promise<IssuedSession> {
    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      });
      return this.sessions.create(user, meta, manager);
    });
  }

  private async issuePasswordReset(
    user: User,
    withinTransaction?: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    const token = await this.dataSource.transaction(async (manager) => {
      const issued = await this.oneTimeTokens.issue(
        user.id,
        OneTimeTokenType.PASSWORD_RESET,
        this.config.ttlSec.passwordReset,
        manager,
      );
      await withinTransaction?.(manager);
      return issued;
    });
    await this.emitTokenMail(AuthEvents.PASSWORD_RESET_REQUESTED, user, token);
  }

  private async updatePassword(
    manager: EntityManager,
    userId: string,
    plain: string,
  ): Promise<void> {
    await manager.getRepository(User).update(userId, {
      passwordHash: await this.passwords.hash(plain),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  /** Suma un intento fallido de forma atómica y, al cruzar un umbral, bloquea y audita. */
  private async registerFailedAttempt(userId: string, meta?: RequestMeta): Promise<void> {
    const [rows]: [Array<{ failed_login_attempts: number }>, number] = await this.dataSource.query(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1
       WHERE id = $1 RETURNING failed_login_attempts`,
      [userId],
    );
    const attempts = rows[0]?.failed_login_attempts ?? 0;
    const minutes = lockMinutesFor(attempts);
    if (minutes === 0) return;
    await this.dataSource
      .getRepository(User)
      .update(userId, { lockedUntil: new Date(Date.now() + minutes * 60_000) });
    if (minutes !== lockMinutesFor(attempts - 1)) {
      this.logger.warn(`Cuenta bloqueada ${minutes} min por intentos fallidos (usuario ${userId})`);
      await this.audit.record({
        actorId: null,
        action: 'ACCOUNT_LOCKED',
        targetType: 'USER',
        targetId: userId,
        reason: null,
        result: 'DENIED',
        metadata: { failedAttempts: attempts, lockMinutes: minutes },
        ipHash: meta?.ipHash ?? null,
      });
    }
  }

  private isLocked(user: User): boolean {
    return user.lockedUntil !== null && user.lockedUntil > new Date();
  }

  private invalidMfa() {
    return new UnauthorizedException({
      code: 'INVALID_MFA',
      message: 'El código no es válido o el paso de verificación venció.',
    });
  }

  private findWithPassword(where: { email: string } | { id: string }): Promise<User | null> {
    const qb = this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash');
    return 'email' in where
      ? qb.where('u.email = :email', { email: where.email }).getOne()
      : qb.where('u.id = :id', { id: where.id }).getOne();
  }

  private async emitTokenMail(event: string, user: User, token: string): Promise<void> {
    const payload: TokenMailEvent = { email: user.email, firstName: user.firstName, token };
    await this.events.emitAsync(event, payload);
  }

  private async emitUserMail(event: string, user: User): Promise<void> {
    const payload: UserMailEvent = { email: user.email, firstName: user.firstName };
    await this.events.emitAsync(event, payload);
  }
}
