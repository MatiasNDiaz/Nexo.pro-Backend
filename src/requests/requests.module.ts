import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ContractsController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/** Solicitudes y contrataciones. Escribe en el chat (mensajes automáticos); el chat no lo importa. */
@Module({
  imports: [ChatModule, NotificationsModule, SubscriptionsModule],
  controllers: [RequestsController, ContractsController],
  providers: [RequestsService],
})
export class RequestsModule {}
