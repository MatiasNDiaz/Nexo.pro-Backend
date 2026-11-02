import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Nombres de cookies (ADR 0008). Con `Secure` se usan prefijos: `__Host-` exige Path=/ y sin Domain
 * (nadie puede pisarla desde otro subdominio); las de path restringido usan `__Secure-`.
 */
export function buildCookieNames(secure: boolean) {
  return {
    access: secure ? '__Host-nx_at' : 'nx_at',
    refresh: secure ? '__Secure-nx_rt' : 'nx_rt',
    csrf: secure ? '__Host-nx_csrf' : 'nx_csrf',
    mfa: secure ? '__Secure-nx_mfa' : 'nx_mfa',
  };
}

/** Configuración tipada del namespace `auth`. Es el ÚNICO lugar que define cookies y duraciones. */
export const authConfig = registerAs('auth', () => {
  const env = validateEnv(process.env);
  const authPath = `/${env.API_PREFIX}/v1/auth`;
  return {
    frontendUrl: env.FRONTEND_URL,
    jwt: {
      secret: env.JWT_ACCESS_SECRET,
      previousSecret: env.JWT_ACCESS_SECRET_PREVIOUS ?? null,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    ttlSec: {
      access: { user: env.ACCESS_TOKEN_TTL_SEC, admin: env.ADMIN_ACCESS_TOKEN_TTL_SEC },
      refreshIdle: { user: env.REFRESH_IDLE_TTL_SEC, admin: env.ADMIN_REFRESH_IDLE_TTL_SEC },
      refreshAbsolute: {
        user: env.REFRESH_ABSOLUTE_TTL_SEC,
        admin: env.ADMIN_REFRESH_ABSOLUTE_TTL_SEC,
      },
      emailVerification: 24 * 3600,
      passwordReset: 30 * 60,
      mfaChallenge: 5 * 60,
      /** Ventana en la que un refresh recién rotado no se considera reutilización (plan §9.3). */
      refreshGrace: 10,
    },
    cookies: {
      secure: env.COOKIE_SECURE,
      names: buildCookieNames(env.COOKIE_SECURE),
      paths: { access: '/', refresh: authPath, csrf: '/', mfa: `${authPath}/mfa` },
    },
    csrfSecret: env.CSRF_SECRET,
    passwordSelfResetEnabled: env.PASSWORD_SELF_RESET_ENABLED,
    maxServiceAreas: env.MAX_SERVICE_AREAS,
  };
});

export type AuthConfig = ConfigType<typeof authConfig>;
