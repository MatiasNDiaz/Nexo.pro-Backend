import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
