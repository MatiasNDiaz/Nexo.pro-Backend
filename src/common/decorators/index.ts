import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccountStatus, UserRole, VerificationStatus } from '../../users/user.enums';

/**
 * Decoradores de metadatos (plan §9.8). Solo marcan rutas: los guards globales de
 * `src/common/guards/` los hacen cumplir. Toda ruta es privada salvo `@Public()`.
 */

export const IS_PUBLIC_KEY = 'isPublic';
/** Ruta sin autenticación (login, registro, health, catálogos públicos). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_ORIGIN_CHECK_KEY = 'skipOriginCheck';
/** Solo para webhooks verificados por firma: no exige Origin ni X-Requested-With. */
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';
/** Solo para webhooks verificados por firma: no exige el token CSRF. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: `${UserRole}`[]) => SetMetadata(ROLES_KEY, roles);

export const ALLOWED_ACCOUNT_STATES_KEY = 'allowedAccountStates';
/** Por defecto solo pasan cuentas ACTIVE. Esta marca habilita otros estados en una ruta. */
export const AllowAccountStates = (...states: `${AccountStatus}`[]) =>
  SetMetadata(ALLOWED_ACCOUNT_STATES_KEY, states);

/** Usuario autenticado. Lo arma el guard JWT leyendo la sesión y el usuario de la base. */
export interface AuthUser {
  id: string;
  /** Fila vigente de `auth_sessions` (cambia en cada rotación). */
  sid: string;
  /** Dispositivo: estable entre rotaciones. El token CSRF se liga a este valor. */
  familyId: string;
  role: UserRole;
  status: AccountStatus;
  verificationStatus: VerificationStatus;
  emailVerified: boolean;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) {
    // No debería pasar en rutas privadas: el guard global corta antes.
    throw new Error('CurrentUser usado en una ruta sin usuario autenticado');
  }
  return req.user;
});
