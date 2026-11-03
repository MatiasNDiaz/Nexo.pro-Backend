import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/** Headers que nunca salen hacia Sentry. */
const PRIVATE_HEADERS = /^(cookie|authorization|x-csrf-token|x-signature|x-forwarded-for)$/i;

/**
 * Inicia Sentry si hay DSN (SEG §20.3). Sin DSN no hace nada: apagado. Nunca manda datos
 * personales: sin IP ni usuario, sin cookies, sin cuerpo ni query del pedido.
 */
export function initErrorReporting(dsn: string | undefined, environment: string): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    // Sin datos personales: ni usuario, ni cookies, ni cuerpos, ni query (SDK 11: `dataCollection`).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    // Solo errores: sin trazas de rendimiento (mandarían rutas y tiempos de cada pedido).
    tracesSampleRate: 0,
    // Segunda barrera, por si una integración agrega algo igual.
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
        const headers = event.request.headers ?? {};
        event.request.headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => !PRIVATE_HEADERS.test(name)),
        );
      }
      return event;
    },
  });
  return true;
}

/** Reporta los errores 500 (los llama el filtro de errores). Sin Sentry iniciado, no hace nada. */
@Injectable()
export class ErrorReporter {
  capture(exception: unknown): void {
    if (Sentry.isInitialized()) Sentry.captureException(exception);
  }
}
