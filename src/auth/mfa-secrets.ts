import { randomInt } from 'crypto';
import { generateSecret, generateURI } from 'otplib';
import { sha256Hex } from '../common/crypto/crypto.utils';

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para códigos que se copian a mano. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_COUNT = 10;
const ISSUER = 'Nexo PRO';

export interface MfaEnrollment {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  recoveryCodeHashes: string[];
}

/** Normaliza un código de recuperación ingresado ("abcde-fghij" → "ABCDEFGHIJ"). */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function recoveryCode(): string {
  const chars = Array.from(
    { length: 10 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** Genera el secreto TOTP y los códigos de recuperación (se muestran una sola vez). */
export function createMfaEnrollment(label: string): MfaEnrollment {
  const secret = generateSecret();
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
  return {
    secret,
    otpauthUri: generateURI({ issuer: ISSUER, label, secret }),
    recoveryCodes,
    recoveryCodeHashes: recoveryCodes.map((code) => sha256Hex(normalizeRecoveryCode(code))),
  };
}
