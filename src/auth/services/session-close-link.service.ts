import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { safeEqual } from '../../common/crypto/crypto.utils';
import { securityConfig, type SecurityConfig } from '../../config/security.config';

/** Vigencia del enlace "No fui yo" del email de dispositivo nuevo (ADR 0031). */
export const SESSION_CLOSE_LINK_TTL_SEC = 7 * 24 * 60 * 60;

/** Separa esta firma de los otros usos de DATA_HMAC_KEY (IP seudonimizada, cookie de dispositivo). */
const PURPOSE = 'session-close-link:v1';
const PAYLOAD_BYTES = 36;
/** 36 bytes en base64url = 48 caracteres; la firma (16 bytes) = 22. */
const TOKEN = /^[A-Za-z0-9_-]{70}$/;

const uuidToBytes = (id: string) => Buffer.from(id.replace(/-/g, ''), 'hex');
const bytesToUuid = (bytes: Buffer) => {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export interface SessionCloseLink {
  userId: string;
  familyId: string;
}

/**
 * Enlace firmado para cerrar un dispositivo desde el email, sin tabla (ADR 0031): lleva la familia
 * de sesión, la cuenta y el vencimiento, más una firma HMAC de 128 bits. Usarlo dos veces no hace
 * daño: cerrar una sesión ya cerrada no cambia nada. Entra en `TokenDto` (70 caracteres).
 */
@Injectable()
export class SessionCloseLinkService {
  constructor(@Inject(securityConfig.KEY) private readonly security: SecurityConfig) {}

  issue(link: SessionCloseLink, now = new Date()): string {
    const payload = Buffer.alloc(PAYLOAD_BYTES);
    uuidToBytes(link.familyId).copy(payload, 0);
    uuidToBytes(link.userId).copy(payload, 16);
    payload.writeUInt32BE(Math.floor(now.getTime() / 1000) + SESSION_CLOSE_LINK_TTL_SEC, 32);
    return payload.toString('base64url') + this.sign(payload);
  }

  /** La familia y la cuenta del enlace, o null si no es válido o venció. */
  verify(token: string, now = new Date()): SessionCloseLink | null {
    if (!TOKEN.test(token)) return null;
    const payload = Buffer.from(token.slice(0, 48), 'base64url');
    if (payload.length !== PAYLOAD_BYTES || !safeEqual(token.slice(48), this.sign(payload))) {
      return null;
    }
    if (payload.readUInt32BE(32) * 1000 <= now.getTime()) return null;
    return {
      familyId: bytesToUuid(payload.subarray(0, 16)),
      userId: bytesToUuid(payload.subarray(16, 32)),
    };
  }

  private sign(payload: Buffer): string {
    return createHmac('sha256', this.security.hmacKey)
      .update(PURPOSE)
      .update(payload)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }
}
