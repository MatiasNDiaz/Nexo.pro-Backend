import type { SecurityConfig } from '../../config/security.config';
import { SESSION_CLOSE_LINK_TTL_SEC, SessionCloseLinkService } from './session-close-link.service';

const service = (hmacKey = 'clave-hmac-de-prueba-000000000000000000') =>
  new SessionCloseLinkService({ hmacKey } as SecurityConfig);
const link = {
  familyId: '5a0c2f3e-8d1b-4c6a-9e7f-0123456789ab',
  userId: 'f1e2d3c4-b5a6-4789-8abc-def012345678',
};
const NOW = new Date('2026-11-03T12:00:00Z');

describe('Enlace para cerrar una sesión desde el email (ADR 0031)', () => {
  it('ida y vuelta: 70 caracteres seguros para una URL', () => {
    const token = service().issue(link, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]{70}$/);
    expect(service().verify(token, NOW)).toEqual(link);
  });

  it('vence a los 7 días', () => {
    const token = service().issue(link, NOW);
    const justBefore = new Date(NOW.getTime() + SESSION_CLOSE_LINK_TTL_SEC * 1000 - 1000);
    expect(service().verify(token, justBefore)).toEqual(link);
    expect(
      service().verify(token, new Date(NOW.getTime() + SESSION_CLOSE_LINK_TTL_SEC * 1000)),
    ).toBeNull();
  });

  it('rechaza un enlace adulterado, firmado con otra clave o con otro formato', () => {
    const token = service().issue(link, NOW);
    const tampered = (token[5] === 'A' ? 'B' : 'A').padStart(6, token.slice(0, 5)) + token.slice(6);
    expect(service().verify(tampered, NOW)).toBeNull();
    expect(service('otra-clave-hmac-000000000000000000000000').verify(token, NOW)).toBeNull();
    expect(service().verify(token.slice(0, 69), NOW)).toBeNull();
    expect(service().verify(`${token.slice(0, 69)}.`, NOW)).toBeNull();
  });
});
