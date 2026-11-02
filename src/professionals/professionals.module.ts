import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { ProfessionalsService } from './professionals.service';

/** Perfil profesional. Por ahora solo lo usan el registro y el cambio de rol (endpoints: etapa 7). */
@Module({
  imports: [LocationsModule],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
