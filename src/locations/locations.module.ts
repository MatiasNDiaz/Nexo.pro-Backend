import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { NeighborhoodsService } from './neighborhoods.service';

@Module({
  controllers: [LocationsController],
  providers: [NeighborhoodsService],
  exports: [NeighborhoodsService],
})
export class LocationsModule {}
