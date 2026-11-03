import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FileVisibility } from '../uploads/file.enums';
import { UploadsService } from '../uploads/uploads.service';
import { ProfessionalCertification } from './entities/professional-certification.entity';
import { ProfessionalMedia } from './entities/professional-media.entity';
import { CertStatus, MediaStatus } from './professional.enums';

type Target = 'media' | 'certification';

const CONFIG = {
  media: {
    entity: ProfessionalMedia,
    table: 'professional_media',
    targetType: 'PROFESSIONAL_MEDIA',
    active: MediaStatus.ACTIVE,
    hidden: MediaStatus.HIDDEN_BY_ADMIN,
  },
  certification: {
    entity: ProfessionalCertification,
    table: 'professional_certifications',
    targetType: 'PROFESSIONAL_CERTIFICATION',
    active: CertStatus.ACTIVE,
    hidden: CertStatus.HIDDEN_BY_ADMIN,
  },
} as const;

/**
 * El admin oculta (y restaura) medios y certificados con motivo y auditoría (FI §6.3, ADR 0020).
 * No hay aprobación previa: el contenido se publica al subirse. Al ocultarlo, el archivo pasa a
 * privado también en Cloudinary (etapa 12): su URL pública deja de responder.
 */
@Injectable()
export class ContentModerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  hide(admin: AuthUser, target: Target, id: string, reason: string): Promise<void> {
    return this.change(admin, target, id, reason, true);
  }

  restore(admin: AuthUser, target: Target, id: string, reason: string): Promise<void> {
    return this.change(admin, target, id, reason, false);
  }

  private async change(
    admin: AuthUser,
    target: Target,
    id: string,
    reason: string,
    hide: boolean,
  ): Promise<void> {
    const config = CONFIG[target];
    const fileId = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository<ProfessionalMedia | ProfessionalCertification>(
        config.entity,
      );
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException();
      const expected: string = hide ? config.active : config.hidden;
      if (String(row.status) !== expected) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: hide ? 'Ese contenido no está visible.' : 'Ese contenido no está oculto.',
        });
      }
      // Los dos enums comparten los valores ACTIVE y HIDDEN_BY_ADMIN.
      await manager.query(
        `UPDATE ${config.table}
            SET status = $2, hidden_by = $3, hidden_at = $4, hidden_reason = $5, updated_at = now()
          WHERE id = $1`,
        hide
          ? [id, config.hidden, admin.id, new Date(), reason]
          : [id, config.active, null, null, null],
      );
      await this.setFileVisibility(manager, row.fileId, hide);
      await this.audit.record(
        {
          actorId: admin.id,
          action: `${config.targetType}_${hide ? 'HIDDEN' : 'RESTORED'}`,
          targetType: config.targetType,
          targetId: id,
          reason,
          result: 'SUCCESS',
          metadata: { professionalId: row.professionalId },
        },
        manager,
      );
      return row.fileId;
    });
    // Después del commit: en Cloudinary el archivo oculto deja de tener URL pública.
    await this.uploads.applyAccess([fileId]);
  }

  private async setFileVisibility(manager: EntityManager, fileId: string, hide: boolean) {
    await manager
      .getRepository(StoredFile)
      .update(fileId, { visibility: hide ? FileVisibility.PRIVATE : FileVisibility.PUBLIC });
  }
}
