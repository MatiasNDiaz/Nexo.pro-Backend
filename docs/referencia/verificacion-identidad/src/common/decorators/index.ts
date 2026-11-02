/**
 * Decoradores de metadatos definidos en el plan (§9.8). Solo marcan rutas: los guards globales que
 * los hacen cumplir (JwtCookieAuthGuard, CsrfGuard, OriginGuard, RolesGuard, AccountStateGuard)
 * se implementan en la fase de autenticación. Si este archivo ya existe en el repo, usar el existente.
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const SKIP_ORIGIN_CHECK_KEY = 'skipOriginCheck';
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK_KEY, true);

export type UserRole = 'CUSTOMER' | 'PROFESSIONAL' | 'ADMIN';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED';
export const ALLOWED_ACCOUNT_STATES_KEY = 'allowedAccountStates';
export const AllowAccountStates = (...states: AccountStatus[]) => SetMetadata(ALLOWED_ACCOUNT_STATES_KEY, states);

/** Usuario autenticado que el JwtCookieAuthGuard adjunta a la request (leído de la base, no del frontend). */
export interface AuthUser {
  id: string;
  sid: string;
  role: UserRole;
  status: AccountStatus;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) {
    // Nunca debería pasar en rutas no públicas: el guard global corta antes.
    throw new Error('CurrentUser usado en una ruta sin usuario autenticado');
  }
  return req.user;
});
