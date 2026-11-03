import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';
import {
  AdminModerationController,
  EvidenceController,
  MyModerationController,
  ReportsController,
} from './moderation.controller';
import { SanctionsExpiryJob } from './moderation.jobs';
import { ReportsService } from './reports.service';
import { SanctionsService } from './sanctions.service';

/** Reportes, strikes, sanciones y apelaciones (ADR 0029). */
@Module({
  imports: [NotificationsModule, UploadsModule, UsersModule],
  controllers: [
    ReportsController,
    MyModerationController,
    EvidenceController,
    AdminModerationController,
  ],
  providers: [ReportsService, SanctionsService, SanctionsExpiryJob],
})
export class ModerationModule {}
