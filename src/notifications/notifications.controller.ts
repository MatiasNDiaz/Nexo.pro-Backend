import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AllowAccountStates, type AuthUser, CurrentUser } from '../common/decorators';
import {
  NotificationPreferenceDto,
  PushKeyDto,
  PushSubscribeDto,
  PushUnsubscribeDto,
  UpdatePreferencesDto,
} from './dto/push.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

export class NotificationsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

/** Notificaciones del propio usuario: dentro de la app y por push (ADR 0032). */
@ApiTags('notifications')
@ApiCookieAuth()
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  /** Clave pública VAPID para `pushManager.subscribe` (o `enabled: false` si no hay push). */
  @Get('push/key')
  @ApiOkResponse({ type: PushKeyDto })
  pushKey(): PushKeyDto {
    return this.push.publicKey();
  }

  /** Este navegador quiere avisos push (después de que la persona dio permiso). */
  @Post('push/subscriptions')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto): Promise<void> {
    return this.push.subscribe(user, dto);
  }

  /** Este navegador ya no quiere avisos push. */
  @Post('push/subscriptions/remove')
  @HttpCode(204)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto): Promise<void> {
    return this.push.unsubscribe(user, dto.endpoint);
  }

  @Get('preferences')
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  preferences(@CurrentUser() user: AuthUser): Promise<NotificationPreferenceDto[]> {
    return this.push.preferences(user);
  }

  @Put('preferences')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferenceDto[]> {
    return this.push.updatePreferences(user, dto.preferences);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationsQueryDto) {
    return this.notifications.list(user.id, query.page, query.limit);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  readAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }
}
