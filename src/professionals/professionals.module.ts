import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ContentModerationService } from './content-moderation.service';
import {
  AdminProfessionalContentController,
  ProfessionalsController,
} from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { ProfileService } from './profile.service';

/** Perfil profesional: alta y zonas (registro, cambio de rol) y la edición del propio perfil. */
@Module({
  imports: [LocationsModule, SubscriptionsModule, UploadsModule],
  controllers: [ProfessionalsController, AdminProfessionalContentController],
  providers: [ProfessionalsService, ProfileService, ContentModerationService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
