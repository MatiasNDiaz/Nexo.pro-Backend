import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request, Response } from 'express';
import { DataSource, EntityManager, IsNull, MoreThan, QueryFailedError } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import {
  decryptField,
  encryptField,
  randomToken,
  sha256Hex,
} from '../../common/crypto/crypto.utils';
import type { AuthUser } from '../../common/decorators';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { type GoogleConfig, googleConfig } from '../../config/google.config';
import { type SecurityConfig, securityConfig } from '../../config/security.config';
import {
  OAUTH_PROVIDER,
  OAuthExchangeError,
  type OAuthProfile,
  type OAuthProvider,
} from '../../integrations/oauth/oauth-provider';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { FRONTEND_PATHS } from '../auth-mail.templates';
import { AuthEvents, type TokenMailEvent } from '../auth.events';
import type { SessionResponseDto } from '../dto/auth-responses.dto';
import {
  AuthIdentity,
  OAuthPendingRequest,
  OAuthProviderName,
  OAuthRequestKind,
} from '../entities/auth-identity.entity';
import { requestMeta } from '../request-meta';
import { AuthService } from '../services/auth.service';
import { AuthCookiesService } from '../services/auth-cookies.service';
import { RegistrationService } from '../services/registration.service';
import { SessionResponderService } from '../services/session-responder.service';
import type { GooglePendingDto, GoogleRegisterDto } from './google-auth.dto';

const STATE_TTL_SEC = 10 * 60;
const PENDING_TTL_SEC = 30 * 60;

/** Resultado del callback que ve el frontend en `/ingresar/google?resultado=…`. */
type CallbackResult =
  { kind: 'SESSION' } | { kind: 'LINK' } | { kind: 'SIGNUP' } | { kind: 'ERROR'; code: string };

interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
}

const notAvailable = () =>
  new NotFoundException({
    code: 'GOOGLE_LOGIN_DISABLED',
    message: 'El login con Google no está disponible.',
  });

const pendingExpired = () =>
  new UnauthorizedException({
    code: 'GOOGLE_PENDING_EXPIRED',
    message: 'El ingreso con Google venció. Volvé a empezar.',
  });

/**
 * Login con Google (ADR 0015 y 0023). Authorization code con PKCE, `state` y `nonce` (los guarda
 * una cookie cifrada de 10 minutos). Si la cuenta de Google ya está vinculada, inicia sesión. Si el
 * email ya existe, NO se vincula solo: hay que probar ser el dueño con la contraseña o con un enlace
 * por email. Si no existe, se completan los mismos datos que en el registro. El admin no usa Google.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly keys: ReadonlyMap<number, Buffer>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly cookies: AuthCookiesService,
    private readonly responder: SessionResponderService,
    private readonly events: EventEmitter2,
    @Inject(OAUTH_PROVIDER) private readonly provider: OAuthProvider | null,
    @Inject(googleConfig.KEY) private readonly google: GoogleConfig,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @Inject(securityConfig.KEY) private readonly security: SecurityConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {
    this.keys = new Map([[security.encryptionKeyVersion, security.encryptionKey]]);
  }

  /** Arma la URL de Google y guarda state, nonce y verificador PKCE en una cookie cifrada. */
  async start(res: Response): Promise<string> {
    const provider = this.requireProvider();
    const data: OAuthState = {
      state: randomToken(24),
      nonce: randomToken(24),
      verifier: randomToken(32),
      expiresAt: Date.now() + STATE_TTL_SEC * 1000,
    };
    const value = encryptField(
      JSON.stringify(data),
      this.security.encryptionKey,
      this.security.encryptionKeyVersion,
    );
    this.cookies.set(res, 'oauth', value, STATE_TTL_SEC);
    const url = await provider.authorizationUrl({
      state: data.state,
      nonce: data.nonce,
      codeChallenge: sha256Base64Url(data.verifier),
    });
    return url.toString();
  }

  /** Vuelta de Google. Siempre termina en una redirección al frontend (es una navegación). */
  async callback(req: Request, res: Response): Promise<string> {
    const provider = this.requireProvider();
    const result = await this.resolveCallback(req, res, provider).catch((error: unknown) => {
      this.logger.warn(`Login con Google fallido: ${(error as Error).name}`);
      return { kind: 'ERROR', code: 'GOOGLE_FAILED' } as const;
    });
    this.cookies.clear(res, 'oauth');
    const url = new URL(FRONTEND_PATHS.googleResult, this.config.frontendUrl);
    url.searchParams.set('resultado', result.kind.toLowerCase());
    if (result.kind === 'ERROR') url.searchParams.set('codigo', result.code);
    return url.toString();
  }

  /** Datos para la pantalla de vincular o completar el registro. */
  async pending(req: Request): Promise<GooglePendingDto> {
    const request = await this.findPending(this.dataSource.manager, req);
    return {
      kind: request.kind,
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
    };
  }

  /** Vincula probando la contraseña de la cuenta existente (mismo bloqueo por intentos del login). */
  async linkWithPassword(
    req: Request,
    res: Response,
    password: string,
  ): Promise<SessionResponseDto> {
    const request = await this.findPending(this.dataSource.manager, req, OAuthRequestKind.LINK);
    if (!(await this.auth.verifyPasswordFor(request.userId!, password))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'La contraseña no es correcta.',
      });
    }
    const user = await this.dataSource.transaction((manager) =>
      this.completeLink(manager, request, 'PASSWORD'),
    );
    this.cookies.clear(res, 'oauthPending');
    return this.openSession(req, res, user);
  }

  /** Manda al email de la cuenta un enlace para confirmar la vinculación. */
  async requestEmailLink(req: Request): Promise<void> {
    const request = await this.findPending(this.dataSource.manager, req, OAuthRequestKind.LINK);
    const token = randomToken(32);
    await this.dataSource
      .getRepository(OAuthPendingRequest)
      .update(request.id, { emailTokenHash: sha256Hex(token) });
    const user = await this.dataSource.getRepository(User).findOneByOrFail({ id: request.userId! });
    const event: TokenMailEvent = { email: user.email, firstName: user.firstName, token };
    await this.events.emitAsync(AuthEvents.GOOGLE_LINK_REQUESTED, event);
  }

  /** Confirma con el enlace del email (puede abrirse en otro navegador): vincula e inicia sesión. */
  async confirmEmailLink(req: Request, res: Response, token: string): Promise<SessionResponseDto> {
    const user = await this.dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(OAuthPendingRequest).findOne({
        where: {
          emailTokenHash: sha256Hex(token),
          kind: OAuthRequestKind.LINK,
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'El enlace no es válido o venció.',
        });
      }
      return this.completeLink(manager, request, 'EMAIL');
    });
    this.cookies.clear(res, 'oauthPending');
    return this.openSession(req, res, user);
  }

  /** Registro con Google: mismos datos obligatorios; email verificado; sin contraseña. */
  async register(req: Request, res: Response, dto: GoogleRegisterDto): Promise<SessionResponseDto> {
    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const request = await this.findPending(manager, req, OAuthRequestKind.SIGNUP, true);
        const created = await this.registration.createGoogleAccount(manager, {
          ...dto,
          email: request.email,
        });
        await this.insertIdentity(manager, created.id, request);
        await manager.getRepository(OAuthPendingRequest).update(request.id, { usedAt: new Date() });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'GOOGLE_ACCOUNT_EXISTS',
          message: 'Ese email o esa cuenta de Google ya están registrados. Iniciá sesión.',
        });
      }
      throw error;
    }
    this.cookies.clear(res, 'oauthPending');
    return this.openSession(req, res, user);
  }

  /** Desvincular Google solo si la cuenta tiene contraseña (ADR 0023). */
  async unlink(authUser: AuthUser): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.id = :id', { id: authUser.id })
        .setLock('pessimistic_write')
        .getOneOrFail();
      const identity = await manager
        .getRepository(AuthIdentity)
        .findOneBy({ userId: user.id, provider: OAuthProviderName.GOOGLE });
      if (!identity) throw new NotFoundException();
      if (user.passwordHash === null) {
        throw new ConflictException({
          code: 'PASSWORD_REQUIRED',
          message: 'Creá una contraseña antes de desvincular Google, para no quedarte sin acceso.',
        });
      }
      await manager.getRepository(AuthIdentity).delete(identity.id);
      await this.record(manager, user.id, 'GOOGLE_UNLINKED');
    });
  }

  /** Para `/auth/me`: si tiene contraseña y si tiene Google vinculado. */
  async accessMethods(userId: string): Promise<{ hasPassword: boolean; googleLinked: boolean }> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId })
      .getOneOrFail();
    const googleLinked = await this.dataSource
      .getRepository(AuthIdentity)
      .existsBy({ userId, provider: OAuthProviderName.GOOGLE });
    return { hasPassword: user.passwordHash !== null, googleLinked };
  }

  // ---------------------------------------------------------------------------------------------

  private async resolveCallback(
    req: Request,
    res: Response,
    provider: OAuthProvider,
  ): Promise<CallbackResult> {
    const query = req.query as Record<string, unknown>;
    if (typeof query.error === 'string') return { kind: 'ERROR', code: 'CANCELLED' };
    const saved = this.readState(req);
    if (!saved || typeof query.state !== 'string' || query.state !== saved.state) {
      return { kind: 'ERROR', code: 'INVALID_STATE' };
    }

    // La URL pública del callback (nunca el header Host) con los parámetros que mandó Google.
    const callbackUrl = new URL(this.google.callbackUrl);
    callbackUrl.search = new URL(req.originalUrl, 'http://localhost').search;
    let profile: OAuthProfile;
    try {
      profile = await provider.exchange({
        callbackUrl,
        expectedState: saved.state,
        expectedNonce: saved.nonce,
        codeVerifier: saved.verifier,
      });
    } catch (error) {
      if (error instanceof OAuthExchangeError) return { kind: 'ERROR', code: 'GOOGLE_FAILED' };
      throw error;
    }
    if (!profile.emailVerified) return { kind: 'ERROR', code: 'EMAIL_NOT_VERIFIED' };

    const identity = await this.dataSource.getRepository(AuthIdentity).findOne({
      where: { provider: OAuthProviderName.GOOGLE, providerSubject: profile.subject },
      relations: { user: true },
    });
    if (identity) {
      const user = identity.user;
      if (!user || user.deletedAt || user.status === AccountStatus.DEACTIVATED) {
        return { kind: 'ERROR', code: 'ACCOUNT_UNAVAILABLE' };
      }
      await this.dataSource
        .getRepository(AuthIdentity)
        .update(identity.id, { lastUsedAt: new Date() });
      await this.openSession(req, res, user);
      return { kind: 'SESSION' };
    }

    const existing = await this.dataSource.getRepository(User).findOneBy({ email: profile.email });
    if (existing) {
      if (existing.role === UserRole.ADMIN) return { kind: 'ERROR', code: 'GOOGLE_NOT_ALLOWED' };
      if (existing.status === AccountStatus.DEACTIVATED) {
        return { kind: 'ERROR', code: 'ACCOUNT_UNAVAILABLE' };
      }
      const other = await this.dataSource
        .getRepository(AuthIdentity)
        .existsBy({ userId: existing.id, provider: OAuthProviderName.GOOGLE });
      if (other) return { kind: 'ERROR', code: 'OTHER_GOOGLE_ACCOUNT' };
      this.savePending(res, await this.createPending(OAuthRequestKind.LINK, profile, existing.id));
      return { kind: 'LINK' };
    }

    this.savePending(res, await this.createPending(OAuthRequestKind.SIGNUP, profile, null));
    return { kind: 'SIGNUP' };
  }

  private readState(req: Request): OAuthState | null {
    const value = this.cookies.read(req, 'oauth');
    if (!value) return null;
    try {
      const data = JSON.parse(decryptField(value, this.keys)) as OAuthState;
      return data.expiresAt > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  private async createPending(
    kind: OAuthRequestKind,
    profile: OAuthProfile,
    userId: string | null,
  ): Promise<string> {
    const token = randomToken(32);
    await this.dataSource.getRepository(OAuthPendingRequest).insert({
      kind,
      provider: OAuthProviderName.GOOGLE,
      providerSubject: profile.subject,
      email: profile.email,
      firstName: profile.givenName?.slice(0, 60) ?? null,
      lastName: profile.familyName?.slice(0, 60) ?? null,
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + PENDING_TTL_SEC * 1000),
    });
    return token;
  }

  private savePending(res: Response, token: string): void {
    this.cookies.set(res, 'oauthPending', token, PENDING_TTL_SEC);
  }

  private async findPending(
    manager: EntityManager,
    req: Request,
    kind?: OAuthRequestKind,
    lock = false,
  ): Promise<OAuthPendingRequest> {
    this.requireProvider();
    const token = this.cookies.read(req, 'oauthPending');
    if (!token) throw pendingExpired();
    const request = await manager.getRepository(OAuthPendingRequest).findOne({
      where: { tokenHash: sha256Hex(token), usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    });
    if (!request || (kind && request.kind !== kind)) throw pendingExpired();
    return request;
  }

  /** Vincula la cuenta existente (en la transacción del llamador) y marca el pedido como usado. */
  private async completeLink(
    manager: EntityManager,
    request: OAuthPendingRequest,
    method: 'PASSWORD' | 'EMAIL',
  ): Promise<User> {
    const used = await manager
      .getRepository(OAuthPendingRequest)
      .update({ id: request.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!used.affected) throw pendingExpired();
    const user = await manager.getRepository(User).findOneBy({ id: request.userId! });
    if (!user || user.role === UserRole.ADMIN || user.status === AccountStatus.DEACTIVATED) {
      throw pendingExpired();
    }
    try {
      await this.insertIdentity(manager, user.id, request);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'GOOGLE_ALREADY_LINKED',
          message: 'Esa cuenta de Google o esta cuenta ya tienen una vinculación.',
        });
      }
      throw error;
    }
    await this.record(manager, user.id, 'GOOGLE_LINKED', { method });
    return user;
  }

  private async insertIdentity(
    manager: EntityManager,
    userId: string,
    request: OAuthPendingRequest,
  ): Promise<void> {
    await manager.getRepository(AuthIdentity).insert({
      userId,
      provider: request.provider,
      providerSubject: request.providerSubject,
      emailAtLink: request.email,
      lastUsedAt: new Date(),
    });
  }

  private async openSession(req: Request, res: Response, user: User): Promise<SessionResponseDto> {
    const issued = await this.auth.startSession(user, requestMeta(req, this.security.hmacKey));
    return this.responder.respond(res, user, issued);
  }

  private record(
    manager: EntityManager,
    userId: string,
    action: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    return this.audit.record(
      {
        actorId: userId,
        action,
        targetType: 'USER',
        targetId: userId,
        reason: null,
        result: 'SUCCESS',
        metadata,
      },
      manager,
    );
  }

  private requireProvider(): OAuthProvider {
    if (!this.provider) throw notAvailable();
    return this.provider;
  }
}

function sha256Base64Url(value: string): string {
  return Buffer.from(sha256Hex(value), 'hex').toString('base64url');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}
