import { VerificationStatus as S } from '../users/user.enums';
import { canTransition } from './verification-state-machine';

describe('verification state machine', () => {
  it('el proveedor solo decide intentos PENDING', () => {
    expect(canTransition(S.PENDING, S.APPROVED, 'PROVIDER')).toBe(true);
    expect(canTransition(S.PENDING, S.REQUIRES_REVIEW, 'PROVIDER')).toBe(true);
    expect(canTransition(S.REQUIRES_REVIEW, S.APPROVED, 'PROVIDER')).toBe(false);
    expect(canTransition(S.REJECTED, S.APPROVED, 'PROVIDER')).toBe(false);
    expect(canTransition(S.APPROVED, S.REVOKED, 'PROVIDER')).toBe(false);
  });

  it('el admin resuelve revisiones y puede revocar', () => {
    expect(canTransition(S.REQUIRES_REVIEW, S.APPROVED, 'ADMIN')).toBe(true);
    expect(canTransition(S.PENDING, S.REJECTED, 'ADMIN')).toBe(true);
    expect(canTransition(S.APPROVED, S.REVOKED, 'ADMIN')).toBe(true);
    expect(canTransition(S.REJECTED, S.APPROVED, 'ADMIN')).toBe(false);
    expect(canTransition(S.REVOKED, S.APPROVED, 'ADMIN')).toBe(false);
  });
});
