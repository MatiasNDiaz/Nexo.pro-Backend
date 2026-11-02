import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { hmacSha256Hex, randomToken, safeEqual } from '../../common/crypto/crypto.utils';
import { type AuthConfig, authConfig } from '../../config/auth.config';

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Token CSRF firmado y ligado al dispositivo (plan §9.5):
 *   token = HMAC(CSRF_SECRET, familyId + "." + valor_aleatorio_de_la_cookie)
 * La cookie es HttpOnly; el token viaja en el body y el frontend lo guarda en memoria y lo manda en
 * `X-CSRF-Token`. Se liga a la familia (estable entre rotaciones del refresh) en vez del `sid`,
 * así no cambia cada 10 minutos.
 */
@Injectable()
export class CsrfService {
  constructor(@Inject(authConfig.KEY) private readonly config: AuthConfig) {}

  newCookieValue(): string {
    return randomToken(16);
  }

  tokenFor(familyId: string, cookieValue: string): string {
    return hmacSha256Hex(this.config.csrfSecret, `${familyId}.${cookieValue}`);
  }

  cookieValueFrom(req: Request): string | undefined {
    const value: unknown = req.cookies?.[this.config.cookies.names.csrf];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  assertValid(req: Request, familyId: string): void {
    const cookieValue = this.cookieValueFrom(req);
    const header = req.headers[CSRF_HEADER];
    const valid =
      cookieValue !== undefined &&
      typeof header === 'string' &&
      safeEqual(this.tokenFor(familyId, cookieValue), header);
    if (!valid) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Token CSRF inválido.' });
    }
  }
}
