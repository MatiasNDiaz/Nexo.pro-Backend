import { Body, Controller, Delete, HttpCode, Put, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthCookiesService } from '../auth/services/auth-cookies.service';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { FileResponseDto, SetAvatarDto } from '../uploads/dto/uploads.dto';
import { UploadsService } from '../uploads/uploads.service';
import { AccountsService } from './accounts.service';
import { DeleteOwnAccountDto } from './dto/account-admin.dto';

@ApiTags('users')
@ApiCookieAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly uploads: UploadsService,
    private readonly cookies: AuthCookiesService,
  ) {}

  /**
   * Foto de perfil (paso 2 del registro, ADR 0006): un archivo AVATAR propio ya confirmado.
   * Reemplaza la anterior, que se borra del almacenamiento.
   */
  @Put('me/avatar')
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: FileResponseDto })
  setAvatar(@CurrentUser() user: AuthUser, @Body() dto: SetAvatarDto): Promise<FileResponseDto> {
    return this.uploads.setAvatar(user, dto.fileId);
  }

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
