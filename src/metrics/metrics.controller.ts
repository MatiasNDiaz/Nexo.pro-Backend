import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { MetricsQueryDto, ProfessionalMetricsDto } from './dto/metrics.dto';
import { MetricsService } from './metrics.service';

/** Métricas del propio profesional (ADR 0033): solo con un plan que las incluya (Premium). */
@ApiTags('professionals')
@ApiCookieAuth()
@Roles('PROFESSIONAL')
@Controller({ path: 'professionals/me/metrics', version: '1' })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOkResponse({ type: ProfessionalMetricsDto })
  mine(
    @CurrentUser() user: AuthUser,
    @Query() query: MetricsQueryDto,
  ): Promise<ProfessionalMetricsDto> {
    return this.metrics.mine(user.id, query);
  }
}

/** Las métricas de un profesional en su ficha del admin, de solo lectura (ADR 0033). */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/users', version: '1' })
export class AdminMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get(':id/metrics')
  @ApiOkResponse({ type: ProfessionalMetricsDto })
  forUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MetricsQueryDto,
  ): Promise<ProfessionalMetricsDto> {
    return this.metrics.forUser(id, query);
  }
}
