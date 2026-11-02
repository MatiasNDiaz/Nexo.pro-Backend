import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

const READY_TIMEOUT_MS = 2000;

/** Health checks sin datos internos: no exponen versión, entorno ni detalles de la base. */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** Liveness: el proceso responde. */
  @Get('live')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: además, la base de datos responde a tiempo. */
  @Get('ready')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no está disponible.' })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await withTimeout(this.dataSource.query('SELECT 1'), READY_TIMEOUT_MS);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
