import { Module } from '@nestjs/common';
import { AdminNeighborhoodsController } from './admin-neighborhoods.controller';
import { LocationsController } from './locations.controller';
import { NeighborhoodModerationService } from './neighborhood-moderation.service';
import { NeighborhoodsService } from './neighborhoods.service';

@Module({
  controllers: [LocationsController, AdminNeighborhoodsController],
  providers: [NeighborhoodsService, NeighborhoodModerationService],
  exports: [NeighborhoodsService],
})
export class LocationsModule {}
