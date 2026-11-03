import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/** Favoritos y avisos de disponibilidad (ADR 0028). Escucha el evento de perfiles: no lo importa. */
@Module({
  imports: [CatalogModule, NotificationsModule, SubscriptionsModule, UploadsModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
