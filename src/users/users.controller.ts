import { Body, Controller, Delete, Get, HttpCode, Patch, Put, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthCookiesService } from '../auth/services/auth-cookies.service';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AvatarResponseDto } from '../identity-verification/dto/identity-verification.dto';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { SetAvatarDto } from '../uploads/dto/uploads.dto';
import { AccountsService } from './accounts.service';
import { DeleteOwnAccountDto } from './dto/account-admin.dto';
import { PersonalDataDto, UpdatePersonalDataDto } from './dto/personal-data.dto';
import { PersonalDataService } from './personal-data.service';

@ApiTags('users')
@ApiCookieAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly identity: IdentityVerificationService,
    private readonly personalData: PersonalDataService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Get('me')
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @ApiOkResponse({ type: PersonalDataDto })
  personal(@CurrentUser() user: AuthUser): Promise<PersonalDataDto> {
    return this.personalData.get(user.id);
  }

  /**
   * Datos personales (ADR 0021). Teléfono y barrio: inmediato. Nombre y apellido con la identidad
   * aprobada: quedan en revisión del admin y en público se ve el anterior (
ameUnderReview).
   */
  @Patch('me')
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: PersonalDataDto })
  updatePersonal(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePersonalDataDto,
  ): Promise<PersonalDataDto & { nameUnderReview: boolean }> {
    return this.personalData.updateOwn(user, dto);
  }

  /**
   * Foto de perfil (paso 2 del registro, ADR 0006): un archivo AVATAR propio ya confirmado.
   * Con la identidad aprobada, la foto nueva queda en revisión del admin y se sigue viendo la
   * anterior (ADR 0019).
   */
  @Put('me/avatar')
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: AvatarResponseDto })
  setAvatar(@CurrentUser() user: AuthUser, @Body() dto: SetAvatarDto): Promise<AvatarResponseDto> {
    return this.identity.changeAvatar(user, dto.fileId);
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
