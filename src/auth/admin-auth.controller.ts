import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AdminReasonDto } from './dto/auth-requests.dto';
import { MessageDto } from './dto/auth-responses.dto';
import { AuthService } from './services/auth.service';

/** Backoffice de credenciales (ADR 0002). Solo ADMIN con cuenta activa. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: true })
@Roles('ADMIN')
@Controller({ path: 'admin/users', version: '1' })
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Envía al email registrado del usuario un enlace de un solo uso (30 min) para elegir una
   * contraseña nueva. El admin nunca ve ni define la contraseña. Motivo obligatorio y auditado.
   */
  @Post(':id/password-reset')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MessageDto })
  async passwordReset(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: AdminReasonDto,
  ): Promise<MessageDto> {
    await this.auth.adminRequestPasswordReset(admin, userId, dto.reason);
    return { message: 'Se envió el enlace de restablecimiento al email del usuario.' };
  }
}
