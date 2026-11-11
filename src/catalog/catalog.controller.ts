import { Controller, Get, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import {
  AllowAccountStates,
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../common/decorators';
import { MetricsViewerService } from '../metrics/metrics-viewer.service';
import { CatalogService } from './catalog.service';
import {
  CatalogPageDto,
  CatalogQueryDto,
  OwnPublicPageDto,
  PublicProfileDto,
} from './dto/catalog.dto';
import { PublicationRequirement, publicationChecklist } from './visibility';

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

/**
 * La página pública propia, aunque todavía no se pueda ver (decisión del fundador del 2026-11-11):
 * el profesional la revisa y sabe qué le falta para publicarla y compartir el enlace. También con la
 * cuenta sin activar, como el resto de su perfil (ADR 0017). No cuenta como visita.
 */
@ApiTags('professionals')
@ApiCookieAuth()
@Roles('PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'professionals/me/public-page', version: '1' })
export class OwnPublicPageController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOkResponse({ type: OwnPublicPageDto })
  async get(@CurrentUser() user: AuthUser): Promise<OwnPublicPageDto> {
    const [missing, profile] = await Promise.all([
      publicationChecklist(this.dataSource, user.id),
      this.catalog.ownerPreview(user.id),
    ]);
    if (!missing || !profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'El perfil no existe.' });
    }
    return {
      published: missing.length === 0,
      missing,
      profile: {
        ...profile,
        identityVerified: !missing.includes(PublicationRequirement.IDENTITY_NOT_VERIFIED),
      },
    };
  }
}
