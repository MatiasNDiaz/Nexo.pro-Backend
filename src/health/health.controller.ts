import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

/**
 * Liveness: el proceso responde. No expone versión, entorno ni datos internos.
 * Readiness (`/health/ready`, con chequeo de base de datos) se agrega en la etapa 4.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get('live')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
