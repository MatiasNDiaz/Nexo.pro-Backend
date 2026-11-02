import { sanitizeAuditMetadata } from './audit.service';

describe('sanitizeAuditMetadata', () => {
  it('descarta claves sensibles y conserva el resto', () => {
    expect(
      sanitizeAuditMetadata({
        userId: 'u-1',
        status: 'APPROVED',
        password: 'x',
        newPassword: 'x',
        refreshToken: 'x',
        apiSecret: 'x',
        Cookie: 'x',
        dniNumber: 'x',
        attempts: 2,
      }),
    ).toEqual({ userId: 'u-1', status: 'APPROVED', attempts: 2 });
  });

  it('devuelve un objeto vacío si no hay metadata', () => {
    expect(sanitizeAuditMetadata(undefined)).toEqual({});
  });
});
