import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { MetricsViewerService } from '../metrics/metrics-viewer.service';
import { CatalogService } from './catalog.service';
import { CatalogPageDto, CatalogQueryDto, PublicProfileDto } from './dto/catalog.dto';

/**
 * Catálogo público: lo ven visitantes, clientes y profesionales (FI §8). Cada búsqueda y cada
 * perfil abierto suman a las métricas del profesional (ADR 0033).
 */
@ApiTags('catalog')
@Public()
@Controller({ path: 'catalog/professionals', version: '1' })
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly viewers: MetricsViewerService,
  ) {}

  /** Orden (ADR 0022): plan, disponibles ahora, perfil más completo. */
  @Get()
  @ApiOkResponse({ type: CatalogPageDto })
  async search(@Query() query: CatalogQueryDto, @Req() req: Request): Promise<CatalogPageDto> {
    return this.catalog.search(query, await this.viewers.identify(req));
  }

  /** Detalle con email y teléfono: límite más estricto contra la recolección de contactos (C-19). */
  @Get(':slug')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicProfileDto })
  async profile(@Param('slug') slug: string, @Req() req: Request): Promise<PublicProfileDto> {
    return this.catalog.profile(slug.slice(0, 80), new Date(), await this.viewers.identify(req));
  }
}
