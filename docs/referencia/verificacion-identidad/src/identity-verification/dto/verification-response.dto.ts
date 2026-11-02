import { IdentityVerification } from '../entities/identity-verification.entity';
import { VerificationStatus } from '../verification-status.enum';

/** Lo que ve el propio usuario. Sin nota interna, sin id del admin, sin referencia del proveedor. */
export class VerificationResponseDto {
  id: string | null;
  status: VerificationStatus;
  provider: string | null;
  attemptNumber: number;
  submittedAt: string | null;
  decidedAt: string | null;
  reasonCode: string | null;

  static from(v: IdentityVerification | null): VerificationResponseDto {
    const dto = new VerificationResponseDto();
    dto.id = v?.id ?? null;
    dto.status = v?.status ?? VerificationStatus.NOT_STARTED;
    dto.provider = v?.provider ?? null;
    dto.attemptNumber = v?.attemptNumber ?? 0;
    dto.submittedAt = v?.submittedAt.toISOString() ?? null;
    dto.decidedAt = v?.decidedAt?.toISOString() ?? null;
    dto.reasonCode = v?.reasonCode ?? null;
    return dto;
  }
}

/** Respuesta al iniciar: incluye cómo continuar con el proveedor (solo en ese momento). */
export class StartVerificationResponseDto extends VerificationResponseDto {
  /** true si ya había un intento abierto y se devolvió ese. */
  alreadyInProgress: boolean;
  redirectUrl: string | null;
  clientToken: string | null;
  /** true en modo manual: el admin se va a contactar con el usuario. */
  manualReview: boolean;
}

/** Vista del admin. */
export class AdminVerificationResponseDto extends VerificationResponseDto {
  userId: string;
  decisionSource: string | null;
  decidedBy: string | null;
  adminNote: string | null;

  static fromAdmin(v: IdentityVerification): AdminVerificationResponseDto {
    const dto = Object.assign(new AdminVerificationResponseDto(), VerificationResponseDto.from(v));
    dto.userId = v.userId;
    dto.decisionSource = v.decisionSource;
    dto.decidedBy = v.decidedBy;
    dto.adminNote = v.adminNote;
    return dto;
  }
}
