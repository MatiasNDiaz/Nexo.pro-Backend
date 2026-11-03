import { ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { AuditLogger } from '../audit/audit-logger';
import { ContentStatus } from './content-status';

interface Moderatable extends ObjectLiteral {
  id: string;
  status: ContentStatus;
  deletedAt: Date | null;
}

/**
 * El admin oculta o restaura contenido de usuarios (reseñas y foro, ADR 0028) con motivo y
 * auditoría. Lo borrado por su autor no se puede restaurar. Corre en la transacción del llamador y
 * devuelve la fila como estaba.
 */
export async function moderateContent<T extends Moderatable>(
  manager: EntityManager,
  audit: AuditLogger,
  input: {
    entity: EntityTarget<T>;
    targetType: string;
    id: string;
    adminId: string;
    reason: string;
    hide: boolean;
  },
): Promise<T> {
  const repository = manager.getRepository(input.entity);
  const row = await repository.findOne({
    where: { id: input.id } as never,
    lock: { mode: 'pessimistic_write' },
  });
  if (!row || row.deletedAt) throw new NotFoundException();
  const expected = input.hide ? ContentStatus.VISIBLE : ContentStatus.HIDDEN_BY_ADMIN;
  if (row.status !== expected) {
    throw new ConflictException({
      code: 'INVALID_STATE_TRANSITION',
      message: input.hide ? 'Ese contenido no está visible.' : 'Ese contenido no está oculto.',
    });
  }
  await repository.update(
    input.id,
    (input.hide
      ? {
          status: ContentStatus.HIDDEN_BY_ADMIN,
          hiddenBy: input.adminId,
          hiddenAt: new Date(),
          hiddenReason: input.reason,
        }
      : {
          status: ContentStatus.VISIBLE,
          hiddenBy: null,
          hiddenAt: null,
          hiddenReason: null,
        }) as never,
  );
  await audit.record(
    {
      actorId: input.adminId,
      action: `${input.targetType}_${input.hide ? 'HIDDEN' : 'RESTORED'}`,
      targetType: input.targetType,
      targetId: input.id,
      reason: input.reason,
      result: 'SUCCESS',
    },
    manager,
  );
  return row;
}
