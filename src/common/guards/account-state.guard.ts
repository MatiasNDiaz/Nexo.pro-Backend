import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStatus } from '../../users/user.enums';
import { ALLOWED_ACCOUNT_STATES_KEY, AuthUser } from '../decorators';

/**
 * Por defecto solo operan cuentas ACTIVE. Las rutas que deben funcionar para cuentas pendientes,
 * suspendidas o baneadas (ver estado, verificarse, apelar, cerrar sesión) lo declaran con
 * `@AllowAccountStates` (ADR 0007).
 */
@Injectable()
export class AccountStateGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) return true;
    const allowed = this.reflector.getAllAndOverride<string[] | undefined>(
      ALLOWED_ACCOUNT_STATES_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [AccountStatus.ACTIVE];
    if (allowed.includes(user.status)) return true;
    throw new ForbiddenException({
      code: 'ACCOUNT_STATE_NOT_ALLOWED',
      message: 'Tu cuenta no puede realizar esta acción en su estado actual.',
    });
  }
}
