import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/** Token aleatorio de 256 bits en base64url (refresh, enlaces de un solo uso, CSRF). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 en hex. Alcanza para tokens aleatorios de 256 bits (no son contraseñas humanas):
 * se guarda solo el hash y el token original nunca toca la base.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256Hex(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** Comparación en tiempo constante (no filtra por tiempo cuántos caracteres coinciden). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * AES-256-GCM (cifrado autenticado). Formato: `v<versión>.<iv>.<tag>.<datos>` en base64url.
 * La versión permite rotar la clave: cada valor dice con qué clave se cifró.
 */
export function encryptField(plain: string, key: Buffer, keyVersion: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'));
  return [`v${keyVersion}`, ...parts].join('.');
}

export function decryptField(payload: string, keys: ReadonlyMap<number, Buffer>): string {
  const [version, iv, tag, data] = payload.split('.');
  const key = keys.get(Number(version?.slice(1)));
  if (!key || !iv || !tag || !data) throw new Error('Valor cifrado inválido o clave desconocida');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
