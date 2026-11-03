import type { Request } from 'express';
import { hmacSha256Hex } from '../common/crypto/crypto.utils';

/** Metadatos minimizados de la request que se guardan con la sesión (plan §9.4). */
export interface RequestMeta {
  userAgent: string | null;
  /** HMAC de la IP: sirve para comparar ("¿misma IP?") sin guardar la IP. */
  ipHash: string | null;
  /** HMAC de la cookie de dispositivo; solo al iniciar sesión (`LoginContextService`, ADR 0031). */
  deviceHash?: string | null;
  /** Ciudad aproximada, solo para el email de dispositivo nuevo. NUNCA se guarda. */
  approximateLocation?: string | null;
}

const USER_AGENT_MAX = 255;

export function requestMeta(req: Request, hmacKey: string): RequestMeta {
  const userAgent = req.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, USER_AGENT_MAX) : null,
    ipHash: req.ip ? hmacSha256Hex(hmacKey, req.ip) : null,
  };
}
