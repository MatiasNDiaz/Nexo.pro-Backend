import { Body, Controller, Delete, HttpCode, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthCookiesService } from '../auth/services/auth-cookies.service';
import { AllowAccountStates, type AuthUser, CurrentUser } from '../common/decorators';
import { AccountsService } from './accounts.service';
import { DeleteOwnAccountDto } from './dto/account-admin.dto';

@ApiTags('users')
@ApiCookieAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly cookies: AuthCookiesService,
  ) {}

  /**
   * Baja de la propia cuenta (ADR 0013 y 0016): exige la contraseña y cierra todas las sesiones.
   * La cuenta queda desactivada durante el período de gracia y después se anonimiza. No disponible
   * para cuentas suspendidas o baneadas (ADR 0007).
   */
  @Delete('me')
  @HttpCode(204)
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteOwnAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.accounts.deleteOwn(user, dto.password);
    this.cookies.clearSession(res);
  }
}
