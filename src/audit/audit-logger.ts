import type { EntityManager } from 'typeorm';
import type { AuditMetadata, AuditResult } from './entities/admin-audit-log.entity';

/**
 * Puerto de auditoría que usan los demás módulos (mismo contrato que el módulo de referencia
 * de verificación de identidad). Se inyecta con `@Inject(AUDIT_LOGGER)`.
 */
export const AUDIT_LOGGER = Symbol('AUDIT_LOGGER');

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  result: `${AuditResult}`;
  metadata?: AuditMetadata;
  /** IP seudonimizada (HMAC, `request-meta.ts`): nunca la IP en claro. */
  ipHash?: string | null;
}

export interface AuditLogger {
  /** Si se pasa `manager`, el registro se escribe dentro de esa transacción. */
  record(entry: AuditEntry, manager?: EntityManager): Promise<void>;
}
