import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProviderModule } from '../integrations/identity/identity-provider.module';
import { IdentityProviderEvent } from './entities/identity-provider-event.entity';
import { IdentityVerification } from './entities/identity-verification.entity';
import {
  AdminIdentityVerificationController,
  IdentityVerificationController,
} from './identity-verification.controller';
import { IDENTITY_VERIFICATION_OPTIONS, IdentityVerificationService } from './identity-verification.service';
import { IDENTITY_SUBJECTS, TypeOrmIdentitySubjects } from './identity-subjects.gateway';
import { IdentityWebhookController } from './identity-webhook.controller';

/**
 * Requiere que la app registre: TypeOrmModule.forRoot, EventEmitterModule.forRoot, ThrottlerModule,
 * un provider global de AUDIT_LOGGER (módulo audit) y los guards globales de la fase de auth.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IdentityVerification, IdentityProviderEvent]), IdentityProviderModule],
  controllers: [IdentityVerificationController, AdminIdentityVerificationController, IdentityWebhookController],
  providers: [
    IdentityVerificationService,
    { provide: IDENTITY_SUBJECTS, useClass: TypeOrmIdentitySubjects },
    {
      provide: IDENTITY_VERIFICATION_OPTIONS,
      useFactory: () => ({ maxAttempts: Number(process.env.IDENTITY_MAX_ATTEMPTS ?? 3) }),
    },
  ],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
