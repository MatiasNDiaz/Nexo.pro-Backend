import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { requestMeta } from '../auth/request-meta';
import { AuthCookiesService } from '../auth/services/auth-cookies.service';
import { TokenService } from '../auth/services/token.service';
import { sha256Hex } from '../common/crypto/crypto.utils';
import { securityConfig, type SecurityConfig } from '../config/security.config';
import { UserRole } from '../users/user.enums';
import type { MetricsViewer } from './metrics-collector.service';

/** Buscadores y vistas previas de enlaces: no son personas. */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|headless/i;
/** Rol por usuario: el admin no se cuenta. Se vacía al llenarse (los roles casi no cambian). */
const MAX_CACHED_ROLES = 10_000;

/**
 * Quién mira el catálogo (ADR 0033), en rutas públicas. Con sesión, la cuenta (leyendo la cookie
 * sin exigirla); sin sesión, la IP seudonimizada con el navegador. Robots y admin no cuentan
 * (`null`).
 */
@Injectable()
export class MetricsViewerService {
  private readonly roles = new Map<string, UserRole | null>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly cookies: AuthCookiesService,
    private readonly tokens: TokenService,
    @Inject(securityConfig.KEY) private readonly security: SecurityConfig,
  ) {}

  async identify(req: Request): Promise<MetricsViewer | null> {
    const meta = requestMeta(req, this.security.hmacKey);
    if (!meta.userAgent || BOT.test(meta.userAgent)) return null;
    const token = this.cookies.read(req, 'access');
    const verified = token ? await this.tokens.verifyAccessToken(token) : null;
    if (verified) {
      if ((await this.roleOf(verified.userId)) === UserRole.ADMIN) return null;
      return { key: `u:${verified.userId}`, userId: verified.userId };
    }
    if (!meta.ipHash) return null;
    return { key: `a:${sha256Hex(`${meta.ipHash}|${meta.userAgent}`).slice(0, 32)}`, userId: null };
  }

  private async roleOf(userId: string): Promise<UserRole | null> {
    if (this.roles.has(userId)) return this.roles.get(userId) ?? null;
    const [row] = await this.dataSource.query<Array<{ role: UserRole }>>(
      `SELECT role FROM users WHERE id = $1`,
      [userId],
    );
    if (this.roles.size >= MAX_CACHED_ROLES) this.roles.clear();
    this.roles.set(userId, row?.role ?? null);
    return row?.role ?? null;
  }
}
