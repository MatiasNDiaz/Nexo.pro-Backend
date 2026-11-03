import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { AdminPanelService } from './admin-panel.service';
import {
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUsersQueryDto,
  DashboardDto,
} from './dto/admin-panel.dto';

/** Panel del admin (FI §19): cifras, búsqueda de usuarios y ficha completa. Solo lectura. */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminPanelController {
  constructor(private readonly panel: AdminPanelService) {}

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.panel.dashboard();
  }

  @Get('users')
  @ApiOkResponse({ type: AdminUserListDto })
  search(@Query() query: AdminUsersQueryDto): Promise<AdminUserListDto> {
    return this.panel.search(query);
  }

  @Get('users/:id')
  @ApiOkResponse({ type: AdminUserDetailDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.panel.detail(id);
  }
}
