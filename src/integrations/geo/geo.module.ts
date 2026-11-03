import { Global, Module } from '@nestjs/common';
import { type AbuseConfig, abuseConfig } from '../../config/abuse.config';
import { CloudflareGeoLocator, GEO_LOCATOR, NoGeoLocator } from './geo-locator';

/** Ubicación aproximada (ADR 0031): Cloudflare si está configurado su secreto; si no, ninguna. */
@Global()
@Module({
  providers: [
    {
      provide: GEO_LOCATOR,
      inject: [abuseConfig.KEY],
      useFactory: (config: AbuseConfig) =>
        config.cloudflareEdgeSecret
          ? new CloudflareGeoLocator(config.cloudflareEdgeSecret)
          : new NoGeoLocator(),
    },
  ],
  exports: [GEO_LOCATOR],
})
export class GeoModule {}
