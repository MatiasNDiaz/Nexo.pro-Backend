import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { AnnouncementsService } from './announcements.service';
import {
  AdminAnnouncementDto,
  AdminMessageDto,
  AdminTicketDto,
  AdminTicketReplyDto,
  AdminTicketsQueryDto,
  AnnouncementDto,
  ContactDto,
  CreateAnnouncementDto,
  CreateTicketDto,
  TicketDto,
  TicketMessageInputDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

/** Consultas a soporte desde la app (FI §21). */
@ApiTags('support')
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Controller({ path: 'support', version: '1' })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Formulario de contacto público (FI §2.4): 3 por hora por IP. */
  @Post('contact')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  contact(@Body() dto: ContactDto) {
    return this.support.contact(dto);
  }

  @Post('tickets')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCreatedResponse({ type: TicketDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto): Promise<TicketDto> {
    return this.support.create(user, dto);
  }

  @Get('tickets')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: [TicketDto] })
  list(@CurrentUser() user: AuthUser): Promise<TicketDto[]> {
    return this.support.list(user);
  }

  @Get('tickets/:id')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: TicketDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TicketDto> {
    return this.support.mine(user, id);
  }

  @Post('tickets/:id/messages')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiCreatedResponse({ type: TicketDto })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketMessageInputDto,
  ): Promise<TicketDto> {
    return this.support.reply(user, id, dto);
  }
}

/** Texto completo de una novedad recibida. */
@ApiTags('support')
@ApiCookieAuth()
@Roles('CUSTOMER', 'PROFESSIONAL')
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AnnouncementDto> {
    return this.announcements.get(user, id);
  }
}

/** Panel del admin: soporte, novedades y mensajes a un usuario. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly announcements: AnnouncementsService,
  ) {}

  @Get('support/tickets')
  tickets(@Query() query: AdminTicketsQueryDto) {
    return this.support.adminList(query);
  }

  @Get('support/tickets/:id')
  @ApiOkResponse({ type: AdminTicketDto })
  ticket(@Param('id', ParseUUIDPipe) id: string): Promise<AdminTicketDto> {
    return this.support.adminGet(id);
  }

  @Post('support/tickets/:id/messages')
  @ApiCreatedResponse({ type: AdminTicketDto })
  replyTicket(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminTicketReplyDto,
  ): Promise<AdminTicketDto> {
    return this.support.adminReply(admin, id, dto.body);
  }

  @Post('support/tickets/:id/close')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminTicketDto })
  close(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminTicketDto> {
    return this.support.adminClose(admin, id);
  }

  @Get('announcements')
  @ApiOkResponse({ type: [AdminAnnouncementDto] })
  announcementsList(): Promise<AdminAnnouncementDto[]> {
    return this.announcements.adminList();
  }

  @Post('announcements')
  @ApiCreatedResponse({ type: AdminAnnouncementDto })
  publish(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<AdminAnnouncementDto> {
    return this.announcements.publish(admin, dto);
  }

  @Post('users/:id/message')
  @HttpCode(204)
  @ApiNoContentResponse()
  message(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminMessageDto,
  ): Promise<void> {
    return this.announcements.message(admin, id, dto);
  }
}
