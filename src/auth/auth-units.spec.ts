import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '../config/app.config';
import { type AuthConfig, buildCookieNames } from '../config/auth.config';
import { AccountStateGuard } from '../common/guards/account-state.guard';
import { OriginGuard } from '../common/guards/origin.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { createMfaEnrollment, normalizeRecoveryCode } from './mfa-secrets';
import { lockMinutesFor } from './services/auth.service';
import { AuthCookiesService } from './services/auth-cookies.service';
import { CsrfService } from './services/csrf.service';

function contextFor(
  req: object,
  metadata: Record<string, unknown> = {},
): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = { getAllAndOverride: (key: string) => metadata[key] } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('bloqueo progresivo por cuenta', () => {
  it.each([
    [4, 0],
    [5, 1],
    [9, 1],
    [10, 15],
    [15, 60],
    [100, 60],
  ])('%i intentos fallidos → %i minutos', (attempts, minutes) => {
    expect(lockMinutesFor(attempts)).toBe(minutes);
  });
});

describe('OriginGuard', () => {
  const guard = (req: object) => {
    const { context, reflector } = contextFor(req);
    return new OriginGuard(reflector, {
      frontendOrigins: ['https://app.example.com'],
    } as AppConfig).canActivate(context);
  };
  const post = (headers: Record<string, string>) => ({ method: 'POST', headers });

  it('deja pasar GET sin controles', () => {
    expect(guard({ method: 'GET', headers: {} })).toBe(true);
  });

  it('exige origen de la allowlist exacta y el header X-Requested-With', () => {
    expect(
      guard(post({ origin: 'https://app.example.com', 'x-requested-with': 'XMLHttpRequest' })),
    ).toBe(true);
    expect(() =>
      guard(post({ origin: 'https://evil.example', 'x-requested-with': 'XMLHttpRequest' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard(
        post({ origin: 'https://app.example.com.evil.io', 'x-requested-with': 'XMLHttpRequest' }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard(post({ origin: 'https://app.example.com' }))).toThrow(ForbiddenException);
    expect(() => guard(post({ 'x-requested-with': 'XMLHttpRequest' }))).toThrow(ForbiddenException);
  });

  it('acepta el origen del Referer si falta Origin', () => {
    expect(
      guard(
        post({ referer: 'https://app.example.com/login', 'x-requested-with': 'XMLHttpRequest' }),
      ),
    ).toBe(true);
  });
});

describe('AccountStateGuard y RolesGuard', () => {
  const user = (status: string, role = 'CUSTOMER') => ({ user: { status, role } });

  it('por defecto solo pasan cuentas ACTIVE', () => {
    const active = contextFor(user('ACTIVE'));
    expect(new AccountStateGuard(active.reflector).canActivate(active.context)).toBe(true);
    const pending = contextFor(user('PENDING_VERIFICATION'));
    expect(() => new AccountStateGuard(pending.reflector).canActivate(pending.context)).toThrow(
      ForbiddenException,
    );
  });

  it('respeta @AllowAccountStates', () => {
    const suspended = contextFor(user('SUSPENDED'), {
      allowedAccountStates: ['ACTIVE', 'SUSPENDED'],
    });
    expect(new AccountStateGuard(suspended.reflector).canActivate(suspended.context)).toBe(true);
  });

  it('@Roles usa el rol del usuario autenticado', () => {
    const admin = contextFor(user('ACTIVE', 'ADMIN'), { roles: ['ADMIN'] });
    expect(new RolesGuard(admin.reflector).canActivate(admin.context)).toBe(true);
    const customer = contextFor(user('ACTIVE'), { roles: ['ADMIN'] });
    expect(() => new RolesGuard(customer.reflector).canActivate(customer.context)).toThrow(
      ForbiddenException,
    );
  });
});

describe('cookies en producción (ADR 0008)', () => {
  it('usa prefijos __Host- y __Secure- cuando las cookies son Secure', () => {
    expect(buildCookieNames(true)).toEqual({
      access: '__Host-nx_at',
      refresh: '__Secure-nx_rt',
      csrf: '__Host-nx_csrf',
      mfa: '__Secure-nx_mfa',
      oauth: '__Secure-nx_oauth',
      oauthPending: '__Secure-nx_oauth_pending',
    });
    expect(buildCookieNames(false).access).toBe('nx_at');
  });

  it('emite y borra con los mismos atributos: HttpOnly, Secure, SameSite=Lax, Path, sin Domain', () => {
    const config = {
      cookies: {
        secure: true,
        names: buildCookieNames(true),
        paths: { access: '/', refresh: '/api/v1/auth', csrf: '/', mfa: '/api/v1/auth/mfa' },
      },
    } as unknown as AuthConfig;
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const res = {
      cookie: (name: string, _value: string, options: Record<string, unknown>) =>
        calls.push({ name, options }),
      clearCookie: (name: string, options: Record<string, unknown>) =>
        calls.push({ name, options }),
    };
    const service = new AuthCookiesService(config);
    service.set(res as never, 'refresh', 'valor', 60);
    service.clear(res as never, 'refresh');
    const [set, clear] = calls;
    expect(set?.name).toBe('__Secure-nx_rt');
    expect(set?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 60_000,
    });
    expect(clear?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
    expect(set?.options).not.toHaveProperty('domain');
  });
});

describe('CsrfService', () => {
  const csrf = new CsrfService({
    csrfSecret: 's'.repeat(32),
    cookies: { names: buildCookieNames(false) },
  } as unknown as AuthConfig);

  it('liga el token al dispositivo: no sirve para otra familia ni con otra cookie', () => {
    const token = csrf.tokenFor('familia-a', 'cookie-1');
    const req = (family: string, cookie: string, header: string) => ({
      family,
      req: { cookies: { nx_csrf: cookie }, headers: { 'x-csrf-token': header } },
    });
    const ok = req('familia-a', 'cookie-1', token);
    expect(() => csrf.assertValid(ok.req as never, ok.family)).not.toThrow();
    const otherFamily = req('familia-b', 'cookie-1', token);
    expect(() => csrf.assertValid(otherFamily.req as never, otherFamily.family)).toThrow(
      ForbiddenException,
    );
    const otherCookie = req('familia-a', 'cookie-2', token);
    expect(() => csrf.assertValid(otherCookie.req as never, otherCookie.family)).toThrow(
      ForbiddenException,
    );
  });
});

describe('enrolamiento MFA', () => {
  it('genera 10 códigos de recuperación distintos y guarda solo sus hashes', () => {
    const enrollment = createMfaEnrollment('admin@example.com');
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(new Set(enrollment.recoveryCodes).size).toBe(10);
    expect(enrollment.recoveryCodeHashes.join()).not.toContain(enrollment.recoveryCodes[0]);
    expect(enrollment.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('normaliza los códigos de recuperación ingresados a mano', () => {
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
  });
});
