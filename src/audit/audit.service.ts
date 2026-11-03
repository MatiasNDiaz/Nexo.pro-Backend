import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEntry, AuditLogger } from './audit-logger';
import { AdminAuditLog, AuditMetadata, AuditResult } from './entities/admin-audit-log.entity';

/** Claves que nunca se guardan en la metadata de auditoría, aunque el llamador las mande. */
const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|dni/i;

/** Quita de la metadata las claves sensibles. Función pura para poder probarla sin base. */
export function sanitizeAuditMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
  const clean: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (!SENSITIVE_KEY.test(key)) clean[key] = value;
  }
  return clean;
}

@Injectable()
export class AuditService implements AuditLogger {
  constructor(@InjectRepository(AdminAuditLog) private readonly logs: Repository<AdminAuditLog>) {}

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(AdminAuditLog) : this.logs;
    await repository.insert({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason,
      result: entry.result as AuditResult,
      metadata: sanitizeAuditMetadata(entry.metadata),
      ipHash: entry.ipHash ?? null,
    });
  }
}
