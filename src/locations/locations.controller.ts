import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators';
import { LocalitiesQueryDto, NeighborhoodSearchQueryDto } from './dto/location-queries.dto';
import { Locality } from './entities/locality.entity';
import { Province } from './entities/province.entity';
import { NeighborhoodsService } from './neighborhoods.service';

interface CatalogItem {
  id: string;
  name: string;
}

/** Datos públicos que necesita el formulario de registro. La administración llega en la etapa 7. */
@ApiTags('locations')
@Public()
@Controller({ path: 'locations', version: '1' })
export class LocationsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly neighborhoods: NeighborhoodsService,
  ) {}

  @Get('provinces')
  async provinces(): Promise<CatalogItem[]> {
    const rows = await this.dataSource
      .getRepository(Province)
      .find({ where: { active: true }, order: { name: 'ASC' } });
    return rows.map(({ id, name }) => ({ id, name }));
  }

  @Get('localities')
  async localities(@Query() query: LocalitiesQueryDto): Promise<CatalogItem[]> {
    const rows = await this.dataSource
      .getRepository(Locality)
      .find({ where: { provinceId: query.provinceId, active: true }, order: { name: 'ASC' } });
    return rows.map(({ id, name }) => ({ id, name }));
  }

  /** Autocompletado de barrios: solo los aprobados por el admin (ADR 0010). */
  @Get('neighborhoods')
  async neighborhoodsSearch(@Query() query: NeighborhoodSearchQueryDto): Promise<CatalogItem[]> {
    const rows = await this.neighborhoods.searchApproved(query.localityId, query.search);
    return rows.map(({ id, name }) => ({ id, name }));
  }
}
