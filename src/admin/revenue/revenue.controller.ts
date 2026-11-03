import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { requestMeta } from '../../auth/request-meta';
import { type AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { securityConfig, type SecurityConfig } from '../../config/security.config';
import {
  RevenueExportDto,
  RevenuePaymentListDto,
  RevenuePaymentsQueryDto,
  RevenueRegistrationListDto,
  RevenueRegistrationsQueryDto,
  RevenueSummaryDto,
  RevenueSummaryQueryDto,
} from './dto/revenue.dto';
import { RevenueService } from './revenue.service';

/** Panel de ingresos (ADR 0030): solo el admin. Exportar a CSV queda auditado. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('ADMIN')
@Controller({ path: 'admin/revenue', version: '1' })
export class RevenueController {
  constructor(
    private readonly revenue: RevenueService,
    @Inject(securityConfig.KEY) private readonly security: SecurityConfig,
  ) {}

  @Get('payments')
  @ApiOkResponse({ type: RevenuePaymentListDto })
  payments(@Query() query: RevenuePaymentsQueryDto): Promise<RevenuePaymentListDto> {
    return this.revenue.payments(query);
  }

  @Get('registrations')
  @ApiOkResponse({ type: RevenueRegistrationListDto })
  registrations(@Query() query: RevenueRegistrationsQueryDto): Promise<RevenueRegistrationListDto> {
    return this.revenue.registrations(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: RevenueSummaryDto })
  summary(@Query() query: RevenueSummaryQueryDto): Promise<RevenueSummaryDto> {
    return this.revenue.summary(query);
  }

  /**
   * POST y no GET: deja un registro de auditoría, así que exige CSRF y Origin como toda escritura
   * (otro sitio no puede hacer que el navegador del admin genere una exportación).
   */
  @Post('exports')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV (UTF-8 con BOM, separador ;, coma decimal)' })
  async export(
    @CurrentUser() admin: AuthUser,
    @Body() dto: RevenueExportDto,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const { ipHash } = requestMeta(req, this.security.hmacKey);
    const { filename, content } = await this.revenue.export(admin, dto, ipHash);
    return new StreamableFile(content, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
      length: content.length,
    });
  }
}
