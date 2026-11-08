import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FilePurpose } from '../uploads/file.enums';
import { sendPrivateContent } from '../uploads/private-content';
import { UploadsService } from '../uploads/uploads.service';
import { UserRole } from '../users/user.enums';
import {
  AddStrikeDto,
  AdminAppealsQueryDto,
  AdminReportDto,
  AdminReportListDto,
  AdminReportsQueryDto,
  AppealDto,
  ApplySanctionDto,
  CreateAppealDto,
  CreateReportDto,
  DecideAppealDto,
  ModerationReasonDto,
  MyModerationDto,
  MyReportDto,
  ReportConversationDto,
  ResolveReportDto,
  SanctionDto,
  StrikeDto,
} from './dto/moderation.dto';
import { ReportsService } from './reports.service';
import { SanctionsService } from './sanctions.service';

/** Clientes y profesionales reportan (ADR 0029). Cuentas activas, con o sin plan. */
@ApiTags('moderation')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('CUSTOMER', 'PROFESSIONAL')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: MyReportDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto): Promise<MyReportDto> {
    return this.reports.create(user, dto);
  }

  @Get('mine')
  @ApiOkResponse({ type: [MyReportDto] })
  mine(@CurrentUser() user: AuthUser): Promise<MyReportDto[]> {
    return this.reports.mine(user);
  }
}

/**
 * Sanciones propias y apelaciones. También para cuentas suspendidas o baneadas: pueden ver el
 * motivo y apelar (ADR 0007).
 */
@ApiTags('moderation')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('CUSTOMER', 'PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED')
@Controller({ path: 'moderation', version: '1' })
export class MyModerationController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Get('me')
  @ApiOkResponse({ type: MyModerationDto })
  me(@CurrentUser() user: AuthUser): Promise<MyModerationDto> {
    return this.sanctions.mine(user);
  }

  @Post('appeals')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCreatedResponse({ type: AppealDto })
  appeal(@CurrentUser() user: AuthUser, @Body() dto: CreateAppealDto): Promise<AppealDto> {
    return this.sanctions.appeal(user, dto);
  }
}

/** Fotos de reportes y de soporte: privadas, para su autor y el admin. */
@ApiTags('moderation')
@ApiCookieAuth()
@Roles('CUSTOMER', 'PROFESSIONAL', 'ADMIN')
@Controller({ path: 'evidence', version: '1' })
export class EvidenceController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  @Get(':fileId')
  async content(
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.dataSource
      .getRepository(StoredFile)
      .findOneBy({ id: fileId, purpose: FilePurpose.EVIDENCE });
    if (!file) throw new NotFoundException();
    if (file.ownerUserId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    sendPrivateContent(res, await this.uploads.privateContent(file));
  }
}

/** Panel del admin: reportes, strikes, sanciones y apelaciones. Todo con motivo y auditado. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminModerationController {
  constructor(
    private readonly reports: ReportsService,
    private readonly sanctions: SanctionsService,
  ) {}

  @Get('reports')
  @ApiOkResponse({ type: AdminReportListDto })
  list(@Query() query: AdminReportsQueryDto): Promise<AdminReportListDto> {
    return this.reports.adminList(query);
  }

  @Get('reports/:id')
  @ApiOkResponse({ type: AdminReportDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminReportDto> {
    return this.reports.adminGet(id);
  }

  @Post('reports/:id/review')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminReportDto })
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminReportDto> {
    return this.reports.startReview(admin, id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminReportDto })
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<AdminReportDto> {
    return this.reports.resolve(admin, id, dto.valid, dto.note);
  }

  /** C-32: solo desde un reporte de mensaje; cada acceso queda auditado. */
  @Get('reports/:id/conversation')
  @ApiOkResponse({ type: ReportConversationDto })
  conversation(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReportConversationDto> {
    return this.reports.conversation(admin, id);
  }

  @Post('users/:id/strikes')
  @ApiCreatedResponse({ type: StrikeDto })
  addStrike(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStrikeDto,
  ): Promise<StrikeDto> {
    return this.sanctions.addStrike(admin, id, dto);
  }

  @Post('strikes/:id/void')
  @HttpCode(200)
  @ApiOkResponse({ type: StrikeDto })
  voidStrike(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
  ): Promise<StrikeDto> {
    return this.sanctions.voidStrike(admin, id, dto.reason);
  }

  @Post('users/:id/sanctions')
  @ApiCreatedResponse({ type: SanctionDto })
  sanction(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplySanctionDto,
  ): Promise<SanctionDto> {
    return this.sanctions.apply(admin, id, dto);
  }

  @Post('sanctions/:id/lift')
  @HttpCode(200)
  @ApiOkResponse({ type: SanctionDto })
  lift(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
  ): Promise<SanctionDto> {
    return this.sanctions.lift(admin, id, dto.reason);
  }

  @Get('appeals')
  appeals(@Query() query: AdminAppealsQueryDto) {
    return this.sanctions.adminAppeals(query);
  }

  @Post('appeals/:id/decide')
  @HttpCode(200)
  @ApiOkResponse({ type: AppealDto })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAppealDto,
  ): Promise<AppealDto> {
    return this.sanctions.decide(admin, id, dto.decision, dto.note);
  }
}
