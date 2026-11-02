import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { type AuthConfig, authConfig } from '../../config/auth.config';

type CookieKind = 'access' | 'refresh' | 'csrf' | 'mfa';

/**
 * Único lugar que escribe y borra cookies de autenticación. Atributos: HttpOnly, SameSite=Lax,
 * Secure según ambiente, Path explícito y sin Domain (host-only de la API, ADR 0001). Para
 * borrar se usan EXACTAMENTE los mismos atributos; si no, el navegador no la borra.
 */
@Injectable()
export class AuthCookiesService {
  constructor(@Inject(authConfig.KEY) private readonly config: AuthConfig) {}

  read(req: Request, kind: CookieKind): string | undefined {
    const value: unknown = req.cookies?.[this.config.cookies.names[kind]];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(res: Response, kind: CookieKind, value: string, maxAgeSec: number): void {
    res.cookie(this.config.cookies.names[kind], value, {
      ...this.attributes(kind),
      maxAge: maxAgeSec * 1000,
    });
  }

  clear(res: Response, kind: CookieKind): void {
    res.clearCookie(this.config.cookies.names[kind], this.attributes(kind));
  }

  clearSession(res: Response): void {
    for (const kind of ['access', 'refresh', 'csrf'] as const) this.clear(res, kind);
  }

  private attributes(kind: CookieKind): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookies.secure,
      sameSite: 'lax',
      path: this.config.cookies.paths[kind],
    };
  }
}
