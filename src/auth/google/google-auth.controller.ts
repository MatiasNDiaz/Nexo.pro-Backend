import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AllowAccountStates,
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
import { SessionResponseDto } from '../dto/auth-responses.dto';
import {
  GoogleLinkConfirmDto,
  GoogleLinkPasswordDto,
  GooglePendingDto,
  GoogleRegisterDto,
} from './google-auth.dto';
import { GoogleAuthService } from './google-auth.service';

const MINUTE = 60_000;

/**
 * Login con Google (ADR 0015 y 0023). El flujo empieza y vuelve por navegación (redirecciones); el
 * resto son llamadas `fetch` del frontend, con las mismas protecciones que el login normal.
 * Con GOOGLE_PROVIDER=disabled todas responden 404.
 */
@ApiTags('auth')
@Controller({ path: 'auth/google', version: '1' })
export class GoogleAuthController {
  constructor(private readonly google: GoogleAuthService) {}

  /** El botón "Entrar con Google" navega acá; redirige a Google. */
  @Public()
  @Get()
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiFoundResponse({ description: 'Redirección a Google' })
  async start(@Res() res: Response): Promise<void> {
    res.redirect(302, await this.google.start(res));
  }

  /**
   * Vuelta de Google. Redirige al frontend: `/ingresar/google?resultado=session|link|signup|error`
   * (con `codigo` si hubo error). Con `session`, las cookies de sesión ya quedaron puestas.
   */
  @Public()
  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiFoundResponse({ description: 'Redirección al frontend' })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    res.redirect(302, await this.google.callback(req, res));
  }

  /** Datos de la vinculación o del registro pendiente (cookie de 30 minutos). */
  @Public()
  @Get('pending')
  @ApiOkResponse({ type: GooglePendingDto })
  pending(@Req() req: Request): Promise<GooglePendingDto> {
    return this.google.pending(req);
  }

  /** Vincular probando la contraseña de la cuenta existente. */
  @Public()
  @Post('link')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOkResponse({ type: SessionResponseDto })
  link(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: GoogleLinkPasswordDto,
  ): Promise<SessionResponseDto> {
    return this.google.linkWithPassword(req, res, dto.password);
  }

  /** Vincular con un enlace al email de la cuenta existente. */
  @Public()
  @Post('link/email')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  async linkByEmail(@Req() req: Request): Promise<void> {
    await this.google.requestEmailLink(req);
  }

  @Public()
  @Post('link/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOkResponse({ type: SessionResponseDto })
  confirm(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: GoogleLinkConfirmDto,
  ): Promise<SessionResponseDto> {
    return this.google.confirmEmailLink(req, res, dto.token);
  }

  /** Registro con Google: completa los datos obligatorios y queda en PENDING_VERIFICATION. */
  @Public()
  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiCreatedResponse({ type: SessionResponseDto })
  register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: GoogleRegisterDto,
  ): Promise<SessionResponseDto> {
    return this.google.register(req, res, dto);
  }

  /** Desvincular Google: solo si la cuenta tiene contraseña. */
  @Delete('link')
  @HttpCode(204)
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  unlink(@CurrentUser() user: AuthUser): Promise<void> {
    return this.google.unlink(user);
  }
}
