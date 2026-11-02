import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CREATE_OPTIONS, configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_CREATE_OPTIONS);
  const config = configureApp(app);
  // Sin host: Node escucha en IPv6 e IPv4 a la vez, así `localhost` funciona aunque resuelva a ::1.
  await app.listen(config.port);
}

void bootstrap();
