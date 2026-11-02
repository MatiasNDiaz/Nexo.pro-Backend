import { VerificationStatus } from './user.enums';

/**
 * "Identidad aprobada" a efectos de la cuenta y del catálogo: aprobada, o aprobada con una foto
 * nueva en revisión del admin (ADR 0019: mientras tanto la cuenta sigue activa y visible).
 */
export function isIdentityApproved(user: {
  verificationStatus: VerificationStatus;
  pendingAvatarFileId: string | null;
}): boolean {
  return (
    user.verificationStatus === VerificationStatus.APPROVED ||
    (user.verificationStatus === VerificationStatus.REQUIRES_REVIEW &&
      user.pendingAvatarFileId !== null)
  );
}
