import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityProviderModule } from '../integrations/identity/identity-provider.module';
import { UploadsModule } from '../uploads/uploads.module';
import {
  AdminIdentityVerificationController,
  IdentityVerificationController,
  IdentityWebhookController,
} from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';

@Module({
  imports: [AuthModule, UploadsModule, IdentityProviderModule],
  controllers: [
    IdentityVerificationController,
    AdminIdentityVerificationController,
    IdentityWebhookController,
  ],
  providers: [IdentityVerificationService],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
