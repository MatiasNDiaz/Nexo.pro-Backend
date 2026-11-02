import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildLoggerOptions } from './common/logging/logger.options';
import { createValidationPipe } from './common/pipes/create-validation-pipe';
import { AppConfig, appConfig } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `.local` primero: ahí van los secretos de cada desarrollador (no se versiona).
      envFilePath: [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`],
      load: [appConfig],
      // Falla al iniciar si el entorno es inválido. Devuelve las variables crudas para que
      // @nestjs/config las copie a process.env (solo copia strings/números/booleanos, no listas);
      // la versión tipada la arma `appConfig` con la misma función.
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
    HealthModule,
  ],
  providers: [
    // Guards globales en el orden del plan (§9.8). Las etapas 5 y 6 agregan origin, JWT, CSRF,
    // estado de cuenta, roles y suscripción después del throttler.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
