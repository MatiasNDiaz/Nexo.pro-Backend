import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LocationsModule } from '../locations/locations.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { OAuthProviderModule } from '../integrations/oauth/oauth-provider.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminAuthController } from './admin-auth.controller';
import { AuthMailListener } from './auth-mail.listener';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google/google-auth.controller';
import { GoogleAuthService } from './google/google-auth.service';
import { AuthCleanupJob } from './auth-cleanup.job';
import { AuthCookiesService } from './services/auth-cookies.service';
import { AuthService } from './services/auth.service';
import { CsrfService } from './services/csrf.service';
import { MfaService } from './services/mfa.service';
import { OneTimeTokensService } from './services/one-time-tokens.service';
import { PasswordService } from './services/password.service';
import { RegistrationService } from './services/registration.service';
import { SessionsService } from './services/sessions.service';
import { SessionResponderService } from './services/session-responder.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // Sin opciones globales en JwtModule: cada firma/verificación pasa secreto y algoritmo explícitos.
  imports: [
    PassportModule,
    JwtModule.register({}),
    LocationsModule,
    ProfessionalsModule,
    UploadsModule,
    OAuthProviderModule,
  ],
  controllers: [AuthController, AdminAuthController, GoogleAuthController],
  providers: [
    AuthService,
    RegistrationService,
    SessionsService,
    TokenService,
    SessionResponderService,
    PasswordService,
    CsrfService,
    AuthCookiesService,
    OneTimeTokensService,
    MfaService,
    JwtStrategy,
    AuthMailListener,
    GoogleAuthService,
    AuthCleanupJob,
  ],
  exports: [CsrfService, SessionsService, PasswordService, AuthCookiesService, TokenService],
})
export class AuthModule {}
