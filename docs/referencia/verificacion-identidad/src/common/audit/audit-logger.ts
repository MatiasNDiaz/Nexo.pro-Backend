import { EntityManager } from 'typeorm';

/**
 * Puerto de auditoría (plan §8.2.6, admin_audit_logs append-only). El módulo `audit` del proyecto
 * lo implementa; acá solo se define el contrato que usa este módulo.
 */
export const AUDIT_LOGGER = Symbol('AUDIT_LOGGER');

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditLogger {
  /** Si se pasa `manager`, el registro se escribe dentro de la misma transacción. */
  record(entry: AuditEntry, manager?: EntityManager): Promise<void>;
}
