import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../common/decorators';
import { VerificationStatus } from './verification-status.enum';

/**
 * Acceso mínimo a `users` que necesita este módulo, sin depender del módulo users (evita ciclos).
 * Columnas usadas (plan §8.2.1): users.id, users.role, users.status, users.verification_status, users.deleted_at.
 */
export const IDENTITY_SUBJECTS = Symbol('IDENTITY_SUBJECTS');

export interface VerificationSubject {
  id: string;
  role: UserRole;
}

export interface IdentitySubjects {
  /** Bloquea la fila del usuario (FOR UPDATE) para serializar operaciones de verificación. */
  lockForVerification(userId: string, manager: EntityManager): Promise<VerificationSubject | null>;
  /**
   * Replica el estado en users.verification_status y ajusta el estado de cuenta:
   * APPROVED activa una cuenta PENDING_VERIFICATION; REVOKED devuelve una cuenta ACTIVE a PENDING_VERIFICATION.
   * Nunca toca cuentas SUSPENDED, BANNED o DEACTIVATED.
   */
  applyVerificationStatus(userId: string, status: VerificationStatus, manager: EntityManager): Promise<void>;
}

@Injectable()
export class TypeOrmIdentitySubjects implements IdentitySubjects {
  async lockForVerification(userId: string, manager: EntityManager): Promise<VerificationSubject | null> {
    const rows: Array<{ id: string; role: UserRole }> = await manager.query(
      'SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [userId],
    );
    return rows[0] ?? null;
  }

  async applyVerificationStatus(userId: string, status: VerificationStatus, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE users
          SET verification_status = $2::verification_status,
              status = CASE
                WHEN $2::verification_status = 'APPROVED' AND status = 'PENDING_VERIFICATION' THEN 'ACTIVE'
                WHEN $2::verification_status = 'REVOKED' AND status = 'ACTIVE' THEN 'PENDING_VERIFICATION'
                ELSE status
              END,
              updated_at = now()
        WHERE id = $1`,
      [userId, status],
    );
  }
}
