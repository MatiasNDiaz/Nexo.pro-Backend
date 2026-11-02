import { randomBytes } from 'crypto';
import { decryptField, encryptField, randomToken, safeEqual, sha256Hex } from './crypto.utils';

describe('crypto.utils', () => {
  const key = randomBytes(32);

  it('cifra y descifra con AES-256-GCM indicando la versión de clave', () => {
    const encrypted = encryptField('JBSWY3DPEHPK3PXP', key, 3);
    expect(encrypted.startsWith('v3.')).toBe(true);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptField(encrypted, new Map([[3, key]]))).toBe('JBSWY3DPEHPK3PXP');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(encryptField('mismo', key, 1)).not.toBe(encryptField('mismo', key, 1));
  });

  it('rechaza un valor alterado (cifrado autenticado)', () => {
    const [version, iv, tag, data] = encryptField('secreto', key, 1).split('.');
    const tampered = [version, iv, tag, `${data}A`].join('.');
    expect(() => decryptField(tampered, new Map([[1, key]]))).toThrow();
  });

  it('rechaza una versión de clave desconocida', () => {
    expect(() => decryptField(encryptField('x', key, 2), new Map([[1, key]]))).toThrow();
  });

  it('genera tokens de 256 bits en base64url y hashes SHA-256 en hex', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex('a')).toHaveLength(64);
  });

  it('compara en tiempo constante, incluso con largos distintos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
