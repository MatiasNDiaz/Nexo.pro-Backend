import { Controller, HttpCode, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public, SkipCsrf, SkipOriginCheck } from '../common/decorators';
import {
  InvalidWebhookSignatureError,
  WebhooksNotSupportedError,
} from '../integrations/identity/identity-verification.provider';
import { IdentityVerificationService } from './identity-verification.service';

interface RawBodyRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Requiere NestFactory.create(AppModule, { rawBody: true }). */
  rawBody?: Buffer;
}

/**
 * Webhook del proveedor. Público y sin CSRF/Origin porque lo llama el proveedor, no un navegador:
 * la autenticidad la da la firma, que valida el adaptador.
 */
@Controller({ path: 'webhooks/identity', version: '1' })
@Public()
@SkipCsrf()
@SkipOriginCheck()
export class IdentityWebhookController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(@Req() req: RawBodyRequest) {
    if (!req.rawBody) throw new UnauthorizedException();
    try {
      const outcome = await this.service.handleWebhook({ headers: req.headers, rawBody: req.rawBody });
      return { received: true, outcome };
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) throw new UnauthorizedException();
      if (error instanceof WebhooksNotSupportedError) throw new NotFoundException();
      throw error;
    }
  }
}
