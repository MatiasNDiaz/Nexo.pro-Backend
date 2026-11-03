import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull, MoreThan } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import { sha256Hex } from '../../common/crypto/crypto.utils';
import { AuthUser } from '../../common/decorators';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { AuthSession, SessionRevokeReason } from '../entities/auth-session.entity';
import { RequestMeta } from '../request-meta';
import { TokenService } from './token.service';

/** Dispositivos con sesión abierta por usuario (aprobado el 03/11/2026). */
export const MAX_DEVICES = 10;

/** Ventana de un inicio de sesión reciente (ADR 0023). */
export const RECENT_LOGIN_MS = 10 * 60 * 1000;

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
}

/** Resultado de presentar un refresh token. Nunca se lanza dentro de la transacción. */
export type RotationResult =
  | { kind: 'ROTATED'; user: User; session: AuthSession; refreshToken: string }
  /** Refresco concurrente (otra pestaña rotó hace segundos): se reusa el sucesor sin rotar. */
  | { kind: 'GRACE'; user: User; session: AuthSession }
  /** Token ya rotado presentado de nuevo: se revocó toda la familia. */
  | { kind: 'REUSED' }
  | { kind: 'INVALID' };

export interface ActiveFamily {
  familyId: string;
  familyExpiresAt: Date;
}

export interface SessionSummary {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

@Injectable()
export class SessionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  /**
   * Sesión nueva (familia nueva) en cada login: nunca se reutiliza una existente. Con más de
   * `MAX_DEVICES` dispositivos activos se cierran los que hace más tiempo no se usan (etapa 12).
   */
  async create(
    user: { id: string; role: UserRole },
    meta: RequestMeta,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<IssuedSession> {
    const now = new Date();
    const familyExpiresAt = addSeconds(now, this.ttl(user.role).absolute);
    const issued = await this.insertRow(manager, user, randomUUID(), familyExpiresAt, meta, now);
    // Una fila vigente por dispositivo; la más reciente es la del último uso.
    const active = await manager.getRepository(AuthSession).find({
      where: { userId: user.id, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      order: { createdAt: 'DESC' },
      select: { id: true, familyId: true },
    });
    const excess = active.slice(MAX_DEVICES).map((row) => row.familyId);
    if (excess.length) {
      await manager
        .createQueryBuilder()
        .update(AuthSession)
        .set({ revokedAt: now, revokeReason: SessionRevokeReason.SESSION_CLOSED })
        .where('family_id IN (:...excess) AND revoked_at IS NULL', { excess })
        .execute();
    }
    return issued;
  }

  /**
   * Rotación atómica (plan §9.3): bloquea la fila del token presentado, la revoca y crea la
   * siguiente de la misma familia. Detecta reutilización y revoca la familia entera.
   */
  async rotate(refreshToken: string, meta: RequestMeta): Promise<RotationResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(AuthSession);
      const current = await sessions.findOne({
        where: { refreshTokenHash: sha256Hex(refreshToken) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return { kind: 'INVALID' } as const;
      const now = new Date();

      if (current.revokedAt) {
        const grace = await this.graceSuccessor(manager, current, now);
        if (grace) return grace;
        if (current.revokeReason !== SessionRevokeReason.ROTATED)
          return { kind: 'INVALID' } as const;
        await this.revokeFamily(manager, current.familyId, SessionRevokeReason.REUSE_DETECTED, now);
        await this.audit.record(
          {
            actorId: null,
            action: 'REFRESH_TOKEN_REUSE',
            targetType: 'USER',
            targetId: current.userId,
            reason: null,
            result: 'DENIED',
            metadata: { familyId: current.familyId },
          },
          manager,
        );
        return { kind: 'REUSED' } as const;
      }

      const user = await this.activeUser(manager, current.userId);
      if (!user || current.expiresAt <= now || current.familyExpiresAt <= now) {
        return { kind: 'INVALID' } as const;
      }
      const next = await this.insertRow(
        manager,
        user,
        current.familyId,
        current.familyExpiresAt,
        meta,
        now,
      );
      await sessions.update(current.id, {
        revokedAt: now,
        revokeReason: SessionRevokeReason.ROTATED,
        replacedById: next.session.id,
        lastUsedAt: now,
      });
      return { kind: 'ROTATED', user, ...next } as const;
    });
    return result;
  }

  /** Familia (dispositivo) de un refresh token vigente, sin modificar nada. */
  async activeFamilyOf(refreshToken: string): Promise<ActiveFamily | null> {
    const session = await this.dataSource.getRepository(AuthSession).findOneBy({
      refreshTokenHash: sha256Hex(refreshToken),
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    return session
      ? { familyId: session.familyId, familyExpiresAt: session.familyExpiresAt }
      : null;
  }

  /**
   * Lo usa el guard JWT en cada request: la sesión `sid` sigue viva y el usuario existe. El rol y
   * el estado salen de la base, así una suspensión o un cambio de rol rigen en la request siguiente.
   */
  async resolveAuthUser(sid: string, userId: string): Promise<AuthUser | null> {
    const now = new Date();
    const row = await this.dataSource
      .getRepository(AuthSession)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.user', 'u')
      .where('s.id = :sid AND s.userId = :userId', { sid, userId })
      .andWhere('s.revokedAt IS NULL AND s.expiresAt > :now AND s.familyExpiresAt > :now', { now })
      .andWhere('u.deletedAt IS NULL AND u.status <> :deactivated', {
        deactivated: AccountStatus.DEACTIVATED,
      })
      .getOne();
    if (!row?.user) return null;
    return {
      id: row.user.id,
      sid: row.id,
      familyId: row.familyId,
      role: row.user.role,
      status: row.user.status,
      verificationStatus: row.user.verificationStatus,
      emailVerified: row.user.emailVerifiedAt !== null,
    };
  }

  async revokeFamilyOf(refreshToken: string, reason: SessionRevokeReason): Promise<void> {
    const family = await this.activeFamilyOf(refreshToken);
    if (family)
      await this.revokeFamily(this.dataSource.manager, family.familyId, reason, new Date());
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    options: { exceptFamilyId?: string; manager?: EntityManager } = {},
  ): Promise<void> {
    const qb = (options.manager ?? this.dataSource.manager)
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where('user_id = :userId AND revoked_at IS NULL', { userId });
    if (options.exceptFamilyId) {
      qb.andWhere('family_id <> :familyId', { familyId: options.exceptFamilyId });
    }
    await qb.execute();
  }

  /** Dispositivos activos del usuario: la fila vigente de cada familia. */
  async listActive(user: AuthUser): Promise<SessionSummary[]> {
    const rows = await this.dataSource.getRepository(AuthSession).find({
      where: { userId: user.id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    const familyStarts = await this.familyStartDates(rows.map((row) => row.familyId));
    return rows.map((row) => ({
      id: row.familyId,
      current: row.familyId === user.familyId,
      userAgent: row.userAgent,
      createdAt: familyStarts.get(row.familyId) ?? row.createdAt,
      lastUsedAt: row.createdAt,
    }));
  }

  /** Cierra un dispositivo propio. 404 si no existe o no es del usuario (no confirma existencia). */
  async closeOwnFamily(user: AuthUser, familyId: string): Promise<void> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date(), revokeReason: SessionRevokeReason.SESSION_CLOSED })
      .where('family_id = :familyId AND user_id = :userId AND revoked_at IS NULL', {
        familyId,
        userId: user.id,
      })
      .execute();
    if (!result.affected) throw new NotFoundException();
  }

  /**
   * Exige que el dispositivo haya iniciado sesión hace menos de 10 minutos (ADR 0023): con una
   * sesión vieja robada no se puede crear contraseña ni dar de baja una cuenta sin contraseña.
   */
  async assertRecentLogin(user: AuthUser, now = new Date()): Promise<void> {
    const startedAt = (await this.familyStartDates([user.familyId])).get(user.familyId);
    if (!startedAt || now.getTime() - new Date(startedAt).getTime() > RECENT_LOGIN_MS) {
      throw new ForbiddenException({
        code: 'REAUTH_REQUIRED',
        message: 'Por seguridad, volvé a iniciar sesión y repetí la acción.',
      });
    }
  }

  private ttl(role: UserRole) {
    const admin = role === UserRole.ADMIN;
    return {
      idle: admin ? this.config.ttlSec.refreshIdle.admin : this.config.ttlSec.refreshIdle.user,
      absolute: admin
        ? this.config.ttlSec.refreshAbsolute.admin
        : this.config.ttlSec.refreshAbsolute.user,
    };
  }

  private async insertRow(
    manager: EntityManager,
    user: { id: string; role: UserRole },
    familyId: string,
    familyExpiresAt: Date,
    meta: RequestMeta,
    now: Date,
  ): Promise<IssuedSession> {
    const { token, hash } = this.tokens.newRefreshToken();
    const idleExpiry = addSeconds(now, this.ttl(user.role).idle);
    const session = manager.getRepository(AuthSession).create({
      userId: user.id,
      familyId,
      refreshTokenHash: hash,
      expiresAt: idleExpiry < familyExpiresAt ? idleExpiry : familyExpiresAt,
      familyExpiresAt,
      userAgent: meta.userAgent,
      ipHash: meta.ipHash,
    });
    await manager.getRepository(AuthSession).insert(session);
    return { session, refreshToken: token };
  }

  /**
   * Ventana de gracia: si el token se rotó hace menos de `refreshGrace` segundos y su sucesor sigue
   * vigente, no es un robo sino dos pestañas refrescando a la vez.
   */
  private async graceSuccessor(
    manager: EntityManager,
    current: AuthSession,
    now: Date,
  ): Promise<RotationResult | null> {
    const graceMs = this.config.ttlSec.refreshGrace * 1000;
    if (
      current.revokeReason !== SessionRevokeReason.ROTATED ||
      !current.replacedById ||
      !current.revokedAt ||
      now.getTime() - current.revokedAt.getTime() > graceMs
    ) {
      return null;
    }
    const successor = await manager.getRepository(AuthSession).findOneBy({
      id: current.replacedById,
      revokedAt: IsNull(),
    });
    const user = successor ? await this.activeUser(manager, successor.userId) : null;
    return successor && user ? { kind: 'GRACE', user, session: successor } : null;
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: now, revokeReason: reason })
      .where('family_id = :familyId AND revoked_at IS NULL', { familyId })
      .execute();
  }

  private activeUser(manager: EntityManager, userId: string): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('u')
      .where('u.id = :userId AND u.deletedAt IS NULL AND u.status <> :deactivated', {
        userId,
        deactivated: AccountStatus.DEACTIVATED,
      })
      .getOne();
  }

  private async familyStartDates(familyIds: string[]): Promise<Map<string, Date>> {
    if (familyIds.length === 0) return new Map();
    const rows: Array<{ family_id: string; started_at: Date }> = await this.dataSource.query(
      `SELECT family_id, min(created_at) AS started_at FROM auth_sessions
       WHERE family_id = ANY($1) GROUP BY family_id`,
      [familyIds],
    );
    return new Map(rows.map((row) => [row.family_id, row.started_at]));
  }
}
