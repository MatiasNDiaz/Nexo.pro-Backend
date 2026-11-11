import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CatalogController, OwnPublicPageController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Catálogo público. El chat lo usa para saber a quién se le puede escribir. */
@Module({
  imports: [UploadsModule, MetricsModule],
  controllers: [CatalogController, OwnPublicPageController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
