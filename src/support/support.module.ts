import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AnnouncementsService } from './announcements.service';
import {
  AdminSupportController,
  AnnouncementsController,
  SupportController,
} from './support.controller';
import { SupportService } from './support.service';

/** Soporte, contacto y novedades (FI §21, ADR 0029). */
@Module({
  imports: [NotificationsModule, UploadsModule],
  controllers: [SupportController, AnnouncementsController, AdminSupportController],
  providers: [SupportService, AnnouncementsService],
})
export class SupportModule {}
