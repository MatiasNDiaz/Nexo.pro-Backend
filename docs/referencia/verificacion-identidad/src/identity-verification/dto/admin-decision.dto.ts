import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const ADMIN_DECISIONS = ['APPROVE', 'REJECT', 'REVOKE'] as const;
export type AdminDecision = (typeof ADMIN_DECISIONS)[number];

export class AdminDecisionDto {
  @IsIn(ADMIN_DECISIONS)
  decision: AdminDecision;

  /** Motivo obligatorio para auditoría (FI §3.4: actor, fecha, objeto, motivo y resultado). */
  @IsString()
  @Length(5, 300)
  reason: string;

  /** Código corto visible para el usuario, p. ej. DOCUMENT_MISMATCH. */
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{2,59}$/)
  reasonCode?: string;

  /** Cómo se verificó (videollamada, presencial...). Interno, no se muestra al usuario. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  adminNote?: string;
}
