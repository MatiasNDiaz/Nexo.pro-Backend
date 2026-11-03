import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowAccountStates, type AuthUser, CurrentUser, Public } from '../common/decorators';
import { securityConfig, type SecurityConfig } from '../config/security.config';
import {
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  MfaVerifyDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/auth-requests.dto';
import {
  CsrfTokenDto,
  CurrentUserDto,
  MeDto,
  MessageDto,
  MfaRequiredDto,
  SessionClosedDto,
  SessionResponseDto,
  SessionSummaryDto,
} from './dto/auth-responses.dto';
import { RegisterDto } from './dto/register.dto';
import { SetPasswordDto } from './google/google-auth.dto';
import { GoogleAuthService } from './google/google-auth.service';
import { SessionRevokeReason } from './entities/auth-session.entity';
import { requestMeta, type RequestMeta } from './request-meta';
import { AuthCookiesService } from './services/auth-cookies.service';
import { AuthService } from './services/auth.service';
import { CsrfService } from './services/csrf.service';
import { LoginContextService } from './services/login-context.service';
import { REGISTER_MESSAGE, RegistrationService } from './services/registration.service';
import { type ActiveFamily, SessionsService } from './services/sessions.service';
import { SessionResponderService } from './services/session-responder.service';
import { TokenService } from './services/token.service';
import { UploadsService } from '../uploads/uploads.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Estados con sesión que pueden ver su cuenta y cerrar sesión (ADR 0007). */
const ANY_SIGNED_IN_STATE = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED'] as const;

/**
 * Autenticación por cookies HttpOnly (plan §9 y docs/auth.md). Los tokens de sesión viajan SOLO en
 * cookies: ningún endpoint los devuelve en el body. El controller solo traduce HTTP ↔ servicios.
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookiesService,
    private readonly csrf: CsrfService,
    private readonly uploads: UploadsService,
    private readonly responder: SessionResponderService,
    private readonly google: GoogleAuthService,
    private readonly loginContext: LoginContextService,
    @Inject(securityConfig.KEY) private readonly security: SecurityConfig,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOkResponse({ type: MessageDto })
  async register(@Body() dto: RegisterDto): Promise<MessageDto> {
    await this.registration.register(dto);
    return { message: REGISTER_MESSAGE };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto | MfaRequiredDto> {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      this.loginContext.forLogin(req, res),
      dto.captchaToken,
    );
    if (result.kind === 'MFA_REQUIRED') {
      const challenge = await this.tokens.signMfaChallenge(result.userId);
      this.cookies.set(res, 'mfa', challenge, 5 * 60);
      return { mfaRequired: true };
    }
    return this.responder.respond(res, result.user, result.issued);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const userId = await this.tokens.verifyMfaChallenge(this.cookies.read(req, 'mfa'));
    if (!userId) {
      throw new UnauthorizedException({
        code: 'INVALID_MFA',
        message: 'El código no es válido o el paso de verificación venció.',
      });
    }
    const result = await this.auth.verifyMfa(userId, dto, this.loginContext.forLogin(req, res));
    this.cookies.clear(res, 'mfa');
    if (result.kind !== 'SESSION') throw new UnauthorizedException();
    return this.responder.respond(res, result.user, result.issued);
  }

  /**
   * Rota el refresh y renueva el access. Exige el token CSRF del dispositivo (se valida acá porque
   * el access puede estar vencido). Reutilizar un refresh ya rotado revoca toda la familia.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CsrfTokenDto> {
    const refreshToken = this.cookies.read(req, 'refresh');
    // Token vigente: CSRF antes de rotar. Un token ya rotado se procesa primero (reutilización o
    // gracia), así un refresh robado sin el token CSRF igual dispara la revocación de la familia.
    const active = refreshToken ? await this.sessions.activeFamilyOf(refreshToken) : null;
    if (active) this.csrf.assertValid(req, active.familyId);

    const result = refreshToken
      ? await this.sessions.rotate(refreshToken, this.meta(req))
      : ({ kind: 'INVALID' } as const);
    if (result.kind === 'REUSED' || result.kind === 'INVALID') {
      this.cookies.clearSession(res);
      throw new UnauthorizedException({
        code: result.kind === 'REUSED' ? 'REFRESH_TOKEN_REUSED' : 'INVALID_REFRESH_TOKEN',
        message: 'Tu sesión terminó. Iniciá sesión de nuevo.',
      });
    }
    if (result.kind === 'GRACE') this.csrf.assertValid(req, result.session.familyId);

    const access = await this.tokens.signAccessToken(result.user, result.session.id);
    this.cookies.set(res, 'access', access, this.tokens.accessTtlFor(result.user.role));
    if (result.kind === 'ROTATED') {
      this.cookies.set(
        res,
        'refresh',
        result.refreshToken,
        this.secondsUntil(result.session.expiresAt),
      );
    }
    return { csrfToken: this.csrfTokenFor(req, res, result.session) };
  }

  /** Tolerante: borra las cookies aunque la sesión ya no exista. Si existe, exige CSRF. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = this.cookies.read(req, 'refresh');
    if (refreshToken) {
      const family = await this.sessions.activeFamilyOf(refreshToken);
      if (family) {
        this.csrf.assertValid(req, family.familyId);
        await this.sessions.revokeFamilyOf(refreshToken, SessionRevokeReason.LOGOUT);
      }
    }
    this.cookies.clearSession(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  @AllowAccountStates(...ANY_SIGNED_IN_STATE)
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.LOGOUT_ALL);
    this.cookies.clearSession(res);
  }

  @Get('me')
  @AllowAccountStates(...ANY_SIGNED_IN_STATE)
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    const current = await this.auth.currentUser(user);
    return {
      ...CurrentUserDto.from(current, await this.uploads.avatarUrls(current)),
      ...(await this.google.accessMethods(current.id)),
    };
  }

  /**
   * Token CSRF para un frontend recién recargado (lo tenía solo en memoria). Funciona con la cookie
   * de refresh, así sirve aunque el access haya vencido. CORS impide que otro sitio lea la respuesta.
   */
  @Public()
  @Get('csrf')
  @ApiOkResponse({ type: CsrfTokenDto })
  async csrfToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CsrfTokenDto> {
    const refreshToken = this.cookies.read(req, 'refresh');
    const family = refreshToken ? await this.sessions.activeFamilyOf(refreshToken) : null;
    if (!family)
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Iniciá sesión.' });
    return { csrfToken: this.csrfTokenFor(req, res, family) };
  }

  @Get('sessions')
  @AllowAccountStates(...ANY_SIGNED_IN_STATE)
  @ApiCookieAuth()
  @ApiOkResponse({ type: [SessionSummaryDto] })
  listSessions(@CurrentUser() user: AuthUser): Promise<SessionSummaryDto[]> {
    return this.sessions.listActive(user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @AllowAccountStates(...ANY_SIGNED_IN_STATE)
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async closeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) familyId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.closeOwnFamily(user, familyId);
    if (familyId === user.familyId) this.cookies.clearSession(res);
  }

  /**
   * "No fui yo" del email de dispositivo nuevo (ADR 0031): cierra esa sesión sin estar logueado.
   * Es POST (los servicios de email abren los enlaces para revisarlos): el enlace lleva a una
   * página del frontend con un botón.
   */
  @Public()
  @Post('sessions/close-by-link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @ApiOkResponse({ type: SessionClosedDto })
  closeByLink(@Body() dto: TokenDto, @Req() req: Request): Promise<SessionClosedDto> {
    return this.sessions.closeByLink(dto.token, this.meta(req));
  }

  @Public()
  @Post('email/verify')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  verifyEmail(@Body() dto: TokenDto): Promise<void> {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('email/resend')
  @HttpCode(204)
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @Throttle({ default: { limit: 3, ttl: HOUR } })
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  resendEmail(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.resendEmailVerification(user);
  }

  /** Apagado por defecto (ADR 0002): responde 404 mientras PASSWORD_SELF_RESET_ENABLED=false. */
  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: HOUR } })
  async forgotPassword(@Body() dto: EmailDto): Promise<MessageDto> {
    await this.auth.requestSelfPasswordReset(dto.email);
    return { message: 'Si el email está registrado, te enviamos un enlace.' };
  }

  /** Usa el enlace del email (lo dispara el admin, ADR 0002). Cierra todas las sesiones. */
  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('password/change')
  @HttpCode(204)
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  /** Cuentas solo Google: crear la primera contraseña, con un login reciente (ADR 0023). */
  @Post('password/set')
  @HttpCode(204)
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  setPassword(@CurrentUser() user: AuthUser, @Body() dto: SetPasswordDto): Promise<void> {
    return this.auth.setPassword(user, dto.newPassword);
  }

  /** Token CSRF de la familia; si la cookie se perdió, emite una nueva con la vida de la familia. */
  private csrfTokenFor(req: Request, res: Response, family: ActiveFamily): string {
    let cookieValue = this.csrf.cookieValueFrom(req);
    if (!cookieValue) {
      cookieValue = this.csrf.newCookieValue();
      this.cookies.set(res, 'csrf', cookieValue, this.secondsUntil(family.familyExpiresAt));
    }
    return this.csrf.tokenFor(family.familyId, cookieValue);
  }

  private secondsUntil(date: Date): number {
    return Math.max(1, Math.floor((date.getTime() - Date.now()) / 1000));
  }

  private meta(req: Request): RequestMeta {
    return requestMeta(req, this.security.hmacKey);
  }
}
