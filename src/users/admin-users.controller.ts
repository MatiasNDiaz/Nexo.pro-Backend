import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AccountsService } from './accounts.service';
import {
  AccountActionDto,
  AccountSummaryDto,
  BanAccountDto,
  ChangeRoleDto,
  SuspendAccountDto,
} from './dto/account-admin.dto';
import { AdminUpdatePersonalDataDto, PersonalDataDto } from './dto/personal-data.dto';
import type { User } from './entities/user.entity';
import { PersonalDataService } from './personal-data.service';

const summary = (user: User): AccountSummaryDto => ({
  id: user.id,
  role: user.role,
  status: user.status,
});

/**
 * Gestión de cuentas por el admin (etapa 6). Todas las acciones exigen motivo y quedan auditadas;
 * las que restringen la cuenta revocan sus sesiones. El frontend debe pedir confirmación.
 */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: true })
@Roles('ADMIN')
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly personalData: PersonalDataService,
  ) {}

  /** Edita datos de un cliente o profesional (ADR 0021): se aplican directo, con motivo. */
  @Patch(':id')
  @ApiOkResponse({ type: PersonalDataDto })
  updateData(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdatePersonalDataDto,
  ): Promise<PersonalDataDto> {
    return this.personalData.updateByAdmin(admin, id, dto);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountSummaryDto })
  async suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendAccountDto,
  ): Promise<AccountSummaryDto> {
    return summary(
      await this.accounts.suspend(admin, id, dto.reason, {
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        reportId: dto.reportId ?? null,
      }),
    );
  }

  @Post(':id/ban')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountSummaryDto })
  async ban(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BanAccountDto,
  ): Promise<AccountSummaryDto> {
    return summary(await this.accounts.ban(admin, id, dto.reason, { reportId: dto.reportId }));
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountSummaryDto })
  async restore(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
  ): Promise<AccountSummaryDto> {
    return summary(await this.accounts.restore(admin, id, dto.reason));
  }

  @Post(':id/change-role')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountSummaryDto })
  async changeRole(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<AccountSummaryDto> {
    return summary(await this.accounts.changeRole(admin, id, dto));
  }

  /** Cuenta comprometida (ADR 0014): cierra todos sus dispositivos. */
  @Post(':id/revoke-sessions')
  @HttpCode(204)
  revokeSessions(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
  ): Promise<void> {
    return this.accounts.revokeSessions(admin, id, dto.reason);
  }

  /** Baja (ADR 0013 y 0016): restaurable con `restore` durante el período de gracia. */
  @Delete(':id')
  @HttpCode(204)
  delete(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
  ): Promise<void> {
    return this.accounts.deleteByAdmin(admin, id, dto.reason);
  }
}
