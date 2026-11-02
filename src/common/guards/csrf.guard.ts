import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CsrfService } from '../../auth/services/csrf.service';
import { AuthUser, SKIP_CSRF_KEY } from '../decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Token CSRF firmado y ligado al dispositivo (plan §9.5) en métodos no seguros con sesión.
 * Las rutas públicas que usan la sesión (refresh, logout) lo verifican en su servicio.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrf: CsrfService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (SAFE_METHODS.has(req.method) || !req.user) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;
    this.csrf.assertValid(req, req.user.familyId);
    return true;
  }
}
