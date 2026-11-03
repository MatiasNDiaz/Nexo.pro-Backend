import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Catálogo público. Solo lectura: no lo importa ningún otro módulo. */
@Module({
  imports: [UploadsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
