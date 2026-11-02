import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LocationsModule } from '../locations/locations.module';
import { AdminAuthController } from './admin-auth.controller';
import { AuthMailListener } from './auth-mail.listener';
import { AuthController } from './auth.controller';
import { AuthCookiesService } from './services/auth-cookies.service';
import { AuthService } from './services/auth.service';
import { CsrfService } from './services/csrf.service';
import { MfaService } from './services/mfa.service';
import { OneTimeTokensService } from './services/one-time-tokens.service';
import { PasswordService } from './services/password.service';
import { RegistrationService } from './services/registration.service';
import { SessionsService } from './services/sessions.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // Sin opciones globales en JwtModule: cada firma/verificación pasa secreto y algoritmo explícitos.
  imports: [PassportModule, JwtModule.register({}), LocationsModule],
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    RegistrationService,
    SessionsService,
    TokenService,
    PasswordService,
    CsrfService,
    AuthCookiesService,
    OneTimeTokensService,
    MfaService,
    JwtStrategy,
    AuthMailListener,
  ],
  exports: [CsrfService, SessionsService],
})
export class AuthModule {}
