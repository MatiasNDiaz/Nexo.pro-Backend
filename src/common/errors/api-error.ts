/** Formato único de error de la API (plan §11.1). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: ApiErrorDetail[];
  requestId: string | null;
  timestamp: string;
}

export interface ApiErrorDetail {
  field: string;
  errors: string[];
}

/** Código por defecto según el status, cuando la excepción no trae uno propio. */
export const DEFAULT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};
