import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  AdminNeighborhoodDto,
  AdminNeighborhoodListDto,
  ListNeighborhoodsQueryDto,
  MergeNeighborhoodDto,
  ModerationReasonDto,
  RenameNeighborhoodDto,
} from './dto/neighborhood-admin.dto';
import { NeighborhoodModerationService } from './neighborhood-moderation.service';

/** Moderación de barrios (ADR 0010). Todo queda auditado. */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/neighborhoods', version: '1' })
export class AdminNeighborhoodsController {
  constructor(private readonly moderation: NeighborhoodModerationService) {}

  /** Por defecto, los pendientes (los más viejos primero) con cuánto se usan. */
  @Get()
  @ApiOkResponse({ type: AdminNeighborhoodListDto })
  list(@Query() query: ListNeighborhoodsQueryDto): Promise<AdminNeighborhoodListDto> {
    return this.moderation.list(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: AdminNeighborhoodDto })
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
  ): Promise<AdminNeighborhoodDto> {
    return this.moderation.approve(admin, id, dto.reason);
  }

  @Patch(':id')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: AdminNeighborhoodDto })
  rename(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameNeighborhoodDto,
  ): Promise<AdminNeighborhoodDto> {
    return this.moderation.rename(admin, id, dto.name, dto.reason);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: AdminNeighborhoodDto })
  merge(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeNeighborhoodDto,
  ): Promise<AdminNeighborhoodDto> {
    return this.moderation.merge(admin, id, dto.targetId, dto.reason);
  }
}
