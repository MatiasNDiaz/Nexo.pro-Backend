import { Module } from '@nestjs/common';
import { StorageModule } from '../integrations/storage/storage.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsCleanupJob } from './uploads-cleanup.job';
import { LocalFilesController, UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [StorageModule, SubscriptionsModule],
  controllers: [UploadsController, LocalFilesController],
  providers: [UploadsService, UploadsCleanupJob],
  exports: [UploadsService],
})
export class UploadsModule {}
