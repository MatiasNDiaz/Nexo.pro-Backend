import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminForumController, ForumController } from './forum.controller';
import { ForumService } from './forum.service';

/** Foro general (FI §13, ADR 0028). */
@Module({
  imports: [NotificationsModule, SubscriptionsModule, UploadsModule],
  controllers: [ForumController, AdminForumController],
  providers: [ForumService],
})
export class ForumModule {}
