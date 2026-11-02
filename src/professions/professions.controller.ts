import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators';
import { Profession } from './entities/profession.entity';

/** Catálogo público de oficios (lo usa el registro). La administración llega en la etapa 7. */
@ApiTags('professions')
@Public()
@Controller({ path: 'professions', version: '1' })
export class ProfessionsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async list(): Promise<Array<{ id: string; name: string; slug: string }>> {
    const rows = await this.dataSource
      .getRepository(Profession)
      .find({ where: { active: true }, order: { name: 'ASC' } });
    return rows.map(({ id, name, slug }) => ({ id, name, slug }));
  }
}
