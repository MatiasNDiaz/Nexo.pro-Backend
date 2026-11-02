import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { REQUEST_ID_HEADER } from './common/logging/logger.options';
import { type AppConfig, appConfig } from './config/app.config';
import { type AuthConfig, authConfig } from './config/auth.config';

/** Opciones con las que se crea la app; las comparten `main.ts` y los tests e2e. */
export const APP_CREATE_OPTIONS = { bodyParser: false, bufferLogs: true } as const;

/**
 * Configuración HTTP de la aplicación. `main.ts` y los tests e2e usan esta misma función,
 * así lo que se prueba es exactamente lo que corre en producción.
 */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(appConfig.KEY);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.useBodyParser('json', { limit: config.bodyLimit });
  app.useBodyParser('urlencoded', { limit: config.bodyLimit, extended: false });
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: config.frontendOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (config.swaggerEnabled && !config.isProduction) {
    const auth = app.get<AuthConfig>(authConfig.KEY);
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Nexo PRO API')
        .setDescription(
          'API REST de Nexo PRO / Repara Ya. Autenticación por cookies HttpOnly: iniciá sesión con ' +
            '/auth/login y mandá el `csrfToken` recibido en el header `X-CSRF-Token` (más ' +
            '`X-Requested-With: XMLHttpRequest`) en todo POST/PATCH/PUT/DELETE. Ver docs/auth.md.',
        )
        .setVersion('1')
        .addCookieAuth(auth.cookies.names.access)
        .build(),
    );
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document);
  }

  app.enableShutdownHooks();
  return config;
}
