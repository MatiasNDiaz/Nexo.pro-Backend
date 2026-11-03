import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Catálogo público. El chat lo usa para saber a quién se le puede escribir. */
@Module({
  imports: [UploadsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
