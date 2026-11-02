import { VerificationStatus as S } from '../users/user.enums';

export type VerificationActor = 'PROVIDER' | 'ADMIN';

/**
 * Transiciones permitidas por actor. Cualquier otra se rechaza (409).
 * - El proveedor solo decide intentos PENDING (un webhook tardío nunca pisa una decisión del admin).
 * - REQUIRES_REVIEW solo lo resuelve el admin.
 * - El admin puede revocar una verificación aprobada (FI §30).
 */
const TRANSITIONS: Record<VerificationActor, Partial<Record<S, readonly S[]>>> = {
  PROVIDER: {
    [S.PENDING]: [S.APPROVED, S.REJECTED, S.REQUIRES_REVIEW],
  },
  ADMIN: {
    [S.PENDING]: [S.APPROVED, S.REJECTED],
    [S.REQUIRES_REVIEW]: [S.APPROVED, S.REJECTED],
    [S.APPROVED]: [S.REVOKED],
  },
};

export function canTransition(from: S, to: S, actor: VerificationActor): boolean {
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

/** Estados en los que el intento sigue abierto (no se puede iniciar otro). */
export const OPEN_STATUSES: readonly S[] = [S.PENDING, S.REQUIRES_REVIEW];
