import { Injectable } from '@nestjs/common';

export interface ErrorCounts {
  unauthorized: number;
  forbidden: number;
  serverErrors: number;
}

/**
 * Cuenta en memoria las respuestas 401, 403 y 5xx desde la última revisión (SEG §20.3). La tarea
 * de alertas las lee y las reinicia. Con una sola instancia de la API alcanza; con varias, cada
 * una cuenta lo suyo (ver docs/operacion.md).
 */
@Injectable()
export class ErrorCounters {
  private counts: ErrorCounts = { unauthorized: 0, forbidden: 0, serverErrors: 0 };

  record(status: number): void {
    if (status === 401) this.counts.unauthorized++;
    else if (status === 403) this.counts.forbidden++;
    else if (status >= 500) this.counts.serverErrors++;
  }

  /** Devuelve lo contado y vuelve a cero. */
  drain(): ErrorCounts {
    const counts = this.counts;
    this.counts = { unauthorized: 0, forbidden: 0, serverErrors: 0 };
    return counts;
  }
}
