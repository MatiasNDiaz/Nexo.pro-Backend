import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type AppConfig, appConfig } from '../../config/app.config';
import { SKIP_ORIGIN_CHECK_KEY } from '../decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF de base para métodos que modifican datos (plan §9.5):
 * - `Origin` (o, si falta, el origen del `Referer`) debe estar en la allowlist exacta.
 * - Header `X-Requested-With: XMLHttpRequest`: un formulario de otro sitio no puede enviarlo y un
 *   fetch cross-origin con ese header dispara un preflight que CORS rechaza.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(appConfig.KEY) config: AppConfig,
  ) {
    this.allowed = new Set(config.frontendOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORIGIN_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    if (!this.allowed.has(requestOrigin(req) ?? '')) {
      throw new ForbiddenException({ code: 'ORIGIN_NOT_ALLOWED', message: 'Origen no permitido.' });
    }
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new ForbiddenException({
        code: 'MISSING_REQUESTED_WITH',
        message: 'Falta el header X-Requested-With.',
      });
    }
    return true;
  }
}

function requestOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== 'null') return origin;
  const referer = req.headers.referer;
  if (typeof referer !== 'string') return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
