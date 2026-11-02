import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';
import type { LogLevel } from '../../config/env.validation';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Rutas que el logger reemplaza por `[REDACTED]`. pino admite `*` como comodín de un nivel.
 * Cubre cabeceras de autenticación y cualquier objeto logueado con contraseñas, tokens o DNI.
 */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'newPassword',
  '*.newPassword',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'csrfToken',
  '*.csrfToken',
  'dni',
  '*.dni',
  // QueryFailedError de TypeORM incluye los parámetros de la query (emails, hashes, etc.).
  'parameters',
  '*.parameters',
];

/** El id de request lo genera siempre el servidor: no se confía en uno enviado por el cliente. */
export function generateRequestId(_req: IncomingMessage, res: ServerResponse): string {
  const id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function buildLoggerOptions(level: LogLevel): Params {
  return {
    pinoHttp: {
      level,
      genReqId: generateRequestId,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
    },
  };
}
