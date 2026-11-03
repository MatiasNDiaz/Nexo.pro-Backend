import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { CatalogService } from './catalog.service';
import { CatalogPageDto, CatalogQueryDto, PublicProfileDto } from './dto/catalog.dto';

/** Catálogo público: lo ven visitantes, clientes y profesionales (FI §8). */
@ApiTags('catalog')
@Public()
@Controller({ path: 'catalog/professionals', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Orden (ADR 0022): plan, disponibles ahora, perfil más completo. */
  @Get()
  @ApiOkResponse({ type: CatalogPageDto })
  search(@Query() query: CatalogQueryDto): Promise<CatalogPageDto> {
    return this.catalog.search(query);
  }

  /** Detalle con email y teléfono: límite más estricto contra la recolección de contactos (C-19). */
  @Get(':slug')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicProfileDto })
  profile(@Param('slug') slug: string): Promise<PublicProfileDto> {
    return this.catalog.profile(slug.slice(0, 80));
  }
}
