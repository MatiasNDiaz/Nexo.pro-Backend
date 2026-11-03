import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CREATE_OPTIONS, configureApp } from './app.setup';
import { initErrorReporting } from './monitoring/error-reporter';

async function bootstrap(): Promise<void> {
  // Antes que nada: si el arranque falla, también queda reportado (apagado sin SENTRY_DSN).
  initErrorReporting(process.env.SENTRY_DSN, process.env.NODE_ENV ?? 'development');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_CREATE_OPTIONS);
  const config = configureApp(app);
  // Sin host: Node escucha en IPv6 e IPv4 a la vez, así `localhost` funciona aunque resuelva a ::1.
  const server: Server = await app.listen(config.port);
  // Un pedido colgado no ocupa la API para siempre. Keep-alive mayor que el del proxy de Railway
  // (60 s) para que el proxy no reuse una conexión que Node ya cerró.
  server.requestTimeout = 60_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 65_000;
}

void bootstrap();
