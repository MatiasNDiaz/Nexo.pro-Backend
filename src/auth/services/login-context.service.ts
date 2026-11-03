import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { hmacSha256Hex, randomToken } from '../../common/crypto/crypto.utils';
import { securityConfig, type SecurityConfig } from '../../config/security.config';
import { GEO_LOCATOR, type GeoLocator } from '../../integrations/geo/geo-locator';
import { requestMeta, type RequestMeta } from '../request-meta';
import { AuthCookiesService } from './auth-cookies.service';

/** 400 días: el máximo que aceptan los navegadores. Se renueva en cada inicio de sesión. */
export const DEVICE_COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;
const DEVICE_ID = /^[A-Za-z0-9_-]{43}$/;

/**
 * Datos de un inicio de sesión (ADR 0031): los de la request, más el dispositivo (cookie propia
 * con un valor al azar; en la base solo su HMAC) y la ciudad aproximada para el email, que no se
 * guarda. Si la cookie falta o no es válida, se crea una: ese dispositivo cuenta como nuevo.
 */
@Injectable()
export class LoginContextService {
  constructor(
    private readonly cookies: AuthCookiesService,
    @Inject(securityConfig.KEY) private readonly security: SecurityConfig,
    @Inject(GEO_LOCATOR) private readonly geo: GeoLocator,
  ) {}

  forLogin(req: Request, res: Response): RequestMeta {
    const current = this.cookies.read(req, 'device');
    const deviceId = current && DEVICE_ID.test(current) ? current : randomToken(32);
    this.cookies.set(res, 'device', deviceId, DEVICE_COOKIE_MAX_AGE_SEC);
    return {
      ...requestMeta(req, this.security.hmacKey),
      deviceHash: hmacSha256Hex(this.security.hmacKey, `device:${deviceId}`),
      approximateLocation: this.geo.approximateLocation(req.headers),
    };
  }
}
