import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { ErrorCounters } from '../../monitoring/error-counters';
import { ErrorReporter } from '../../monitoring/error-reporter';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiErrorBody, ApiErrorDetail, DEFAULT_ERROR_CODES } from '../errors/api-error';

const GENERIC_SERVER_MESSAGE = 'Ocurrió un error inesperado. Intentá de nuevo más tarde.';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  details: ApiErrorDetail[];
}

/**
 * Convierte cualquier excepción al formato único de la API. Los errores 5xx nunca exponen
 * mensaje, stack ni detalles internos (por ejemplo, de PostgreSQL): eso queda solo en los logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** Opcionales: los tests unitarios crean el filtro sin ellos. */
  constructor(
    @Optional() private readonly counters?: ErrorCounters,
    @Optional() private readonly errorReporter?: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    const resolved = resolve(exception);
    this.counters?.record(resolved.status);
    if (resolved.status >= 500) {
      this.logger.error(exception instanceof Error ? exception : String(exception));
      this.errorReporter?.capture(exception);
    }

    const body: ApiErrorBody = {
      statusCode: resolved.status,
      code: resolved.code,
      message: resolved.message,
      details: resolved.details,
      requestId: typeof request.id === 'string' ? request.id : null,
      timestamp: new Date().toISOString(),
    };
    response.status(resolved.status).json(body);
  }
}

/**
 * Violaciones de integridad de PostgreSQL que reflejan un conflicto del cliente. Se responden
 * con 409 y un mensaje genérico: nunca se exponen nombres de tablas ni de constraints.
 */
const POSTGRES_CONFLICTS: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'La operación entra en conflicto con datos relacionados.',
};

function resolve(exception: unknown): ResolvedError {
  if (exception instanceof HttpException) return fromHttpException(exception);
  if (exception instanceof QueryFailedError) {
    return fromPostgresError(exception.driverError as { code?: unknown });
  }
  const clientError = fromExposedClientError(exception);
  if (clientError) return clientError;
  return serverError(HttpStatus.INTERNAL_SERVER_ERROR);
}

function fromHttpException(exception: HttpException): ResolvedError {
  const status = exception.getStatus();
  if (status >= 500) return serverError(status);

  const payload = exception.getResponse();
  const fields =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const code = typeof fields.code === 'string' ? fields.code : defaultCode(status);
  const message =
    typeof fields.message === 'string'
      ? fields.message
      : typeof payload === 'string'
        ? payload
        : exception.message;
  const details = Array.isArray(fields.details) ? (fields.details as ApiErrorDetail[]) : [];
  return { status, code, message, details };
}

/**
 * Errores de middlewares de Express (p. ej. body-parser: JSON inválido o body demasiado grande).
 * Siguen la convención de `http-errors`: `status` numérico y `expose: true` si son seguros de mostrar.
 */
function fromExposedClientError(exception: unknown): ResolvedError | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  if (typeof status !== 'number' || status < 400 || status >= 500 || expose !== true) return null;
  const message =
    status === 413 ? 'El cuerpo de la solicitud es demasiado grande.' : 'Solicitud inválida.';
  return { status, code: defaultCode(status), message, details: [] };
}

function fromPostgresError(driverError: { code?: unknown }): ResolvedError {
  const sqlState = driverError.code;
  const message = typeof sqlState === 'string' ? POSTGRES_CONFLICTS[sqlState] : undefined;
  if (!message) return serverError(HttpStatus.INTERNAL_SERVER_ERROR);
  return { status: HttpStatus.CONFLICT, code: 'CONFLICT', message, details: [] };
}

function serverError(status: number): ResolvedError {
  return { status, code: defaultCode(status), message: GENERIC_SERVER_MESSAGE, details: [] };
}

function defaultCode(status: number): string {
  return DEFAULT_ERROR_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}
