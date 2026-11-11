import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CustomersService } from './customers.service';
import { AdminForumController, CustomersController, ForumController } from './forum.controller';
import { ForumService } from './forum.service';

/** Foro general (FI §13, ADR 0028) y el catálogo de clientes para profesionales (ADR 0037). */
@Module({
  imports: [NotificationsModule, SubscriptionsModule, UploadsModule],
  controllers: [ForumController, AdminForumController, CustomersController],
  providers: [ForumService, CustomersService],
})
export class ForumModule {}
