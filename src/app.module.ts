import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AccountStateGuard } from './common/guards/account-state.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { buildLoggerOptions } from './common/logging/logger.options';
import { createValidationPipe } from './common/pipes/create-validation-pipe';
import { type AppConfig, appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { mailConfig } from './config/mail.config';
import { securityConfig } from './config/security.config';
import { identityConfig, storageConfig } from './config/storage.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { MailModule } from './integrations/mail/mail.module';
import { LocationsModule } from './locations/locations.module';
import { ProfessionsModule } from './professions/professions.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `.local` primero: ahí van los secretos de cada desarrollador (no se versiona).
      envFilePath: [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`],
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        securityConfig,
        mailConfig,
        storageConfig,
        identityConfig,
      ],
      // Falla al iniciar si el entorno es inválido. Devuelve las variables crudas para que
      // @nestjs/config las copie a process.env (solo copia strings/números/booleanos, no listas);
      // la versión tipada la arman los namespaces de src/config con la misma función.
      validate: (raw) => {
        validateEnv(raw);
        return raw;
      },
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => buildLoggerOptions(config.logLevel),
    }),
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => [
        { ttl: config.throttle.ttlMs, limit: config.throttle.limit },
      ],
    }),
    EventEmitterModule.forRoot(),
    // Tareas programadas (purga diaria, limpieza de subidas). Apagadas en los tests.
    ScheduleModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => ({ cronJobs: config.nodeEnv !== 'test' }),
    }),
    DatabaseModule,
    AuditModule,
    MailModule,
    HealthModule,
    LocationsModule,
    ProfessionsModule,
    AuthModule,
    UsersModule,
    UploadsModule,
    IdentityVerificationModule,
    SubscriptionsModule,
    ProfessionalsModule,
  ],
  providers: [
    // Guards globales, en este orden (plan §9.8). Denegación por defecto: solo `@Public()` pasa
    // sin sesión. La etapa 9 agrega el de suscripción/plan al final.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AccountStateGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
