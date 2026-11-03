import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import {
  AdminReviewsController,
  PlatformReviewsController,
  PublicReviewsController,
  ReviewsController,
} from './reviews.controller';
import { PlatformReviewsService } from './platform-reviews.service';
import { ReviewsService } from './reviews.service';

/** Reseñas de profesionales y de la plataforma (ADR 0028). */
@Module({
  imports: [CatalogModule, NotificationsModule, SubscriptionsModule],
  controllers: [
    ReviewsController,
    PublicReviewsController,
    PlatformReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsService, PlatformReviewsService],
})
export class ReviewsModule {}
