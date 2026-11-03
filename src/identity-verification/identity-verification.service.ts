import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import { SessionRevokeReason } from '../auth/entities/auth-session.entity';
import { SessionsService } from '../auth/services/sessions.service';
import type { AuthUser } from '../common/decorators';
import type { ApiErrorDetail } from '../common/errors/api-error';
import { type IdentityConfig, identityConfig } from '../config/storage.config';
import {
  IDENTITY_PROVIDER,
  type IdentityVerificationProvider,
  type WebhookRequest,
} from '../integrations/identity/identity-verification.provider';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FilePurpose } from '../uploads/file.enums';
import { UploadsService } from '../uploads/uploads.service';
import { isIdentityApproved } from '../users/identity-status';
import { User } from '../users/entities/user.entity';
import { UserRole, VerificationStatus } from '../users/user.enums';
import {
  type AdminDecision,
  type AdminDecisionDto,
  type AdminVerificationListDto,
  type AvatarResponseDto,
  AdminVerificationResponseDto,
  type ListVerificationsQueryDto,
  type StartVerificationResponseDto,
  VerificationResponseDto,
  type VerificationSubjectDto,
} from './dto/identity-verification.dto';
import { IdentityProviderEvent } from './entities/identity-provider-event.entity';
import {
  DecisionSource,
  IdentityVerification,
  VerificationKind,
} from './entities/identity-verification.entity';
import { canTransition, OPEN_STATUSES } from './verification-state-machine';

export type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'UNKNOWN_REFERENCE';

const PG_UNIQUE_VIOLATION = '23505';

const ADMIN_TARGET: Record<AdminDecision, VerificationStatus> = {
  APPROVE: VerificationStatus.APPROVED,
  REJECT: VerificationStatus.REJECTED,
  REVOKE: VerificationStatus.REVOKED,
};

/**
 * Verificación de identidad (ADR 0003), portada de `docs/referencia/verificacion-identidad`.
 * Diferencias con la referencia: usa la auditoría, la configuración y las sesiones del proyecto;
 * exige el perfil completo (email verificado y foto, ADR 0006) para iniciar y para aprobar; y al
 * revocar cierra las sesiones del usuario en la misma transacción.
 */
@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: SessionsService,
    private readonly uploads: UploadsService,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityVerificationProvider,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(identityConfig.KEY) private readonly config: IdentityConfig,
  ) {}

  /** El usuario (cliente o profesional) inicia la verificación. Idempotente si ya hay un intento abierto. */
  async start(user: AuthUser): Promise<StartVerificationResponseDto> {
    if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException();
    }

    const subject = await this.dataSource.getRepository(User).findOneByOrFail({ id: user.id });
    // Aprobada (o aprobada con una foto nueva en revisión, ADR 0019): no hay nada que iniciar.
    if (isIdentityApproved(subject)) {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: 'La identidad ya está verificada.',
      });
    }
    const open = await this.findOpenAttempt(user.id);
    if (open) return this.toStartResponse(open, true, null, null);

    this.assertProfileComplete(subject);
    // Las revisiones de foto no cuentan como intentos (ADR 0019).
    const attempts = await this.dataSource
      .getRepository(IdentityVerification)
      .countBy({ userId: user.id, kind: VerificationKind.IDENTITY });
    if (attempts >= this.config.maxAttempts) {
      throw new UnprocessableEntityException({
        code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
        message: 'Alcanzaste el máximo de intentos. Contactá a soporte.',
      });
    }

    // La sesión del proveedor se crea antes de la transacción para no retener locks durante una
    // llamada externa. Si la transacción falla después, la sesión huérfana no tiene efecto.
    const verificationId = randomUUID();
    const session = await this.provider.createSession({ verificationId, userId: user.id });

    try {
      const created = await this.dataSource.transaction(async (manager) => {
        if (!(await this.lockSubject(manager, user.id))) throw new NotFoundException();
        const repository = manager.getRepository(IdentityVerification);
        const entity = repository.create({
          id: verificationId,
          userId: user.id,
          status: VerificationStatus.PENDING,
          provider: this.provider.name,
          providerReference: session.providerReference,
          attemptNumber: await this.nextAttemptNumber(manager, user.id),
          kind: VerificationKind.IDENTITY,
          decisionSource: null,
          reasonCode: null,
          adminNote: null,
          decidedBy: null,
          submittedAt: new Date(),
          decidedAt: null,
        });
        await repository.insert(entity);
        await this.applyVerificationStatus(manager, user.id, VerificationStatus.PENDING);
        return entity;
      });
      return this.toStartResponse(created, false, session.redirectUrl, session.clientToken);
    } catch (error) {
      // Dos requests simultáneas: el índice único parcial deja pasar una sola; devolvemos esa.
      if (this.isUniqueViolation(error)) {
        const existing = await this.findOpenAttempt(user.id);
        if (existing) return this.toStartResponse(existing, true, null, null);
      }
      throw error;
    }
  }

  async getMine(userId: string): Promise<VerificationResponseDto> {
    return VerificationResponseDto.from(await this.findLatest(userId));
  }

  /**
   * Procesa un aviso del proveedor. La firma se valida en el adaptador; el resultado se consulta
   * al proveedor (no se confía en el cuerpo). Idempotente por (provider, eventId).
   */
  async handleWebhook(request: WebhookRequest): Promise<WebhookOutcome> {
    const notice = await this.provider.parseWebhook(request);
    const events = this.dataSource.getRepository(IdentityProviderEvent);

    let event = await events.findOneBy({ provider: this.provider.name, eventId: notice.eventId });
    if (event?.processedAt) return 'DUPLICATE';
    if (!event) {
      try {
        event = await events.save(
          events.create({
            provider: this.provider.name,
            eventId: notice.eventId,
            verificationId: null,
          }),
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) return 'DUPLICATE'; // otro worker lo está procesando
        throw error;
      }
    }

    const verification = await this.dataSource.getRepository(IdentityVerification).findOneBy({
      provider: this.provider.name,
      providerReference: notice.providerReference,
    });
    if (!verification) {
      await events.update(event.id, {
        processedAt: new Date(),
        processingError: 'UNKNOWN_REFERENCE',
      });
      this.logger.warn(`Webhook de identidad con referencia desconocida (evento ${event.id})`);
      return 'UNKNOWN_REFERENCE';
    }

    const decision = await this.provider.fetchDecision(notice.providerReference);
    const target = decision.outcome === 'PENDING' ? null : VerificationStatus[decision.outcome];
    const eventId = event.id;

    try {
      const changed = await this.dataSource.transaction(async (manager) => {
        await this.lockSubject(manager, verification.userId);
        const current = await this.lockVerification(manager, verification.id);
        let applied = false;
        if (target && canTransition(current.status, target, 'PROVIDER')) {
          const review = target === VerificationStatus.REQUIRES_REVIEW;
          current.status = target;
          current.decisionSource = review ? null : DecisionSource.PROVIDER;
          current.decidedAt = review ? null : new Date();
          current.reasonCode = decision.reasonCode;
          await manager.getRepository(IdentityVerification).save(current);
          await this.applyVerificationStatus(manager, current.userId, target);
          applied = true;
        }
        await manager.getRepository(IdentityProviderEvent).update(eventId, {
          verificationId: current.id,
          processedAt: new Date(),
          processingError: null,
        });
        return applied;
      });
      return changed ? 'PROCESSED' : 'IGNORED';
    } catch (error) {
      // Queda sin processed_at para que el reintento del proveedor lo vuelva a procesar.
      await events.update(eventId, { processingError: 'PROCESSING_FAILED' });
      throw error;
    }
  }

  /** Decisión manual del admin. Motivo obligatorio y auditoría en la misma transacción. */
  async adminDecide(
    admin: AuthUser,
    verificationId: string,
    dto: AdminDecisionDto,
  ): Promise<AdminVerificationResponseDto> {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException();
    const target = ADMIN_TARGET[dto.decision];
    let discarded: StoredFile[] = [];

    const updated = await this.dataSource.transaction(async (manager) => {
      const found = await manager
        .getRepository(IdentityVerification)
        .findOneBy({ id: verificationId });
      if (!found) throw new NotFoundException();
      if (!(await this.lockSubject(manager, found.userId))) throw new NotFoundException();
      const current = await this.lockVerification(manager, verificationId);

      if (!canTransition(current.status, target, 'ADMIN')) {
        // Fuera de la transacción: el intento denegado queda auditado aunque se haga rollback.
        await this.audit.record(this.auditEntry(admin, current, dto, 'DENIED'));
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `No se puede pasar de ${current.status} a ${target}.`,
        });
      }
      const subject = await manager.getRepository(User).findOneByOrFail({ id: current.userId });
      const profileReview = current.kind === VerificationKind.PROFILE_CHANGE;
      if (target === VerificationStatus.APPROVED && !profileReview) {
        // ADR 0006: solo se aprueba con el perfil completo.
        this.assertProfileComplete(subject);
      }

      current.status = target;
      current.decisionSource = DecisionSource.ADMIN;
      current.decidedBy = admin.id;
      current.decidedAt = new Date();
      current.reasonCode = dto.reasonCode ?? current.reasonCode;
      current.adminNote = dto.adminNote ?? current.adminNote;
      const saved = await manager.getRepository(IdentityVerification).save(current);

      if (profileReview) {
        // ADR 0019 y 0021: aprobar aplica la foto y el nombre pendientes; rechazar los descarta.
        // La identidad sigue aprobada en los dos casos.
        discarded = await this.resolveProfileReview(
          manager,
          subject,
          target === VerificationStatus.APPROVED,
        );
        await this.applyVerificationStatus(manager, current.userId, VerificationStatus.APPROVED);
      } else {
        if (target === VerificationStatus.REVOKED && hasPendingChanges(subject)) {
          // Revocar la identidad cierra también la revisión de datos abierta.
          discarded = await this.resolveProfileReview(manager, subject, false);
          await this.closeOpenProfileReview(manager, admin.id, subject.id, 'IDENTITY_REVOKED');
        }
        await this.applyVerificationStatus(manager, current.userId, target);
      }
      if (target === VerificationStatus.REVOKED) {
        // La cuenta vuelve a PENDING_VERIFICATION: se cierran sus sesiones.
        await this.sessions.revokeAllForUser(
          current.userId,
          SessionRevokeReason.VERIFICATION_REVOKED,
          { manager },
        );
      }
      await this.audit.record(this.auditEntry(admin, saved, dto, 'SUCCESS'), manager);
      return saved;
    });

    await this.uploads.deleteFromStorage(discarded);
    return AdminVerificationResponseDto.fromAdmin(updated);
  }

  /**
   * Cambio de foto de perfil. Antes de la primera aprobación se reemplaza directamente. Con la
   * identidad aprobada (ADR 0019) la foto nueva queda pendiente, la verificación pasa a revisión
   * del admin y en público se sigue viendo la anterior.
   */
  async changeAvatar(user: AuthUser, fileId: string): Promise<AvatarResponseDto> {
    let discarded: StoredFile[] = [];
    const result = await this.dataSource.transaction(async (manager) => {
      const subject = await manager
        .getRepository(User)
        .findOne({ where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!subject) throw new NotFoundException();
      const file = await this.uploads.lockReadyFile(manager, user.id, fileId, FilePurpose.AVATAR);
      if (subject.avatarFileId === file.id || subject.pendingAvatarFileId === file.id) {
        return { file, underReview: subject.pendingAvatarFileId === file.id };
      }

      if (!isIdentityApproved(subject)) {
        discarded = await this.uploads.markDeleted(
          manager,
          subject.avatarFileId ? [subject.avatarFileId] : [],
        );
        await manager.getRepository(User).update(subject.id, { avatarFileId: file.id });
        return { file, underReview: false };
      }

      discarded = await this.uploads.markDeleted(
        manager,
        subject.pendingAvatarFileId ? [subject.pendingAvatarFileId] : [],
      );
      await manager.getRepository(User).update(subject.id, { pendingAvatarFileId: file.id });
      await this.openProfileReview(manager, subject.id);
      return { file, underReview: true };
    });
    await this.uploads.deleteFromStorage(discarded);
    return { ...this.uploads.toResponse(result.file), underReview: result.underReview };
  }

  /** Cola de revisión del admin: las más viejas primero, con los datos para reconocer a la persona. */
  async adminList(query: ListVerificationsQueryDto): Promise<AdminVerificationListDto> {
    const [rows, total] = await this.dataSource.getRepository(IdentityVerification).findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { submittedAt: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const subjects = await this.subjectsOf(rows.map((row) => row.userId));
    return {
      data: rows.map((row) =>
        AdminVerificationResponseDto.fromAdmin(row, subjects.get(row.userId)),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Cambio de nombre (ADR 0021), en la transacción del llamador con el usuario bloqueado. Con la
   * identidad aprobada queda pendiente en la revisión de datos; si no, se aplica directamente.
   * Devuelve true si quedó en revisión.
   */
  async proposeNameChange(
    manager: EntityManager,
    subject: User,
    firstName: string,
    lastName: string,
  ): Promise<boolean> {
    const users = manager.getRepository(User);
    if (!isIdentityApproved(subject)) {
      await users.update(subject.id, { firstName, lastName });
      return false;
    }
    if (subject.firstName === firstName && subject.lastName === lastName) {
      // Vuelve al nombre aprobado: no hay nada que revisar.
      await users.update(subject.id, { pendingFirstName: null, pendingLastName: null });
      if (!subject.pendingAvatarFileId) await this.closeIfNothingPending(manager, subject.id);
      return false;
    }
    await users.update(subject.id, { pendingFirstName: firstName, pendingLastName: lastName });
    await this.openProfileReview(manager, subject.id);
    return true;
  }

  /**
   * El admin cambia el nombre directamente (ADR 0021): reemplaza el nombre pendiente y, si ya no
   * queda nada por revisar, cierra la revisión.
   */
  async applyNameByAdmin(
    manager: EntityManager,
    adminId: string,
    subject: User,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    await manager
      .getRepository(User)
      .update(subject.id, { firstName, lastName, pendingFirstName: null, pendingLastName: null });
    if (subject.pendingFirstName && !subject.pendingAvatarFileId) {
      await this.closeOpenProfileReview(manager, adminId, subject.id, 'SUPERSEDED_BY_ADMIN');
      await this.applyVerificationStatus(manager, subject.id, VerificationStatus.APPROVED);
    }
  }

  // ---------------------------------------------------------------------------------------------

  /** Abre la revisión de datos (foto y nombre) si no hay una abierta. */
  private async openProfileReview(manager: EntityManager, userId: string): Promise<void> {
    const repository = manager.getRepository(IdentityVerification);
    const open = await repository.findOneBy({
      userId,
      kind: VerificationKind.PROFILE_CHANGE,
      status: VerificationStatus.REQUIRES_REVIEW,
    });
    if (open) return;
    await repository.insert(
      repository.create({
        id: randomUUID(),
        userId,
        kind: VerificationKind.PROFILE_CHANGE,
        status: VerificationStatus.REQUIRES_REVIEW,
        provider: 'MANUAL',
        providerReference: null,
        attemptNumber: await this.nextAttemptNumber(manager, userId),
        decisionSource: null,
        reasonCode: null,
        adminNote: null,
        decidedBy: null,
        submittedAt: new Date(),
        decidedAt: null,
      }),
    );
    await this.applyVerificationStatus(manager, userId, VerificationStatus.REQUIRES_REVIEW);
  }

  /** El usuario retiró lo último que había pendiente: la revisión se cierra sin decisión. */
  private async closeIfNothingPending(manager: EntityManager, userId: string): Promise<void> {
    const result = await manager.getRepository(IdentityVerification).update(
      {
        userId,
        kind: VerificationKind.PROFILE_CHANGE,
        status: VerificationStatus.REQUIRES_REVIEW,
      },
      { status: VerificationStatus.REJECTED, decidedAt: new Date(), reasonCode: 'WITHDRAWN' },
    );
    if (result.affected) {
      await this.applyVerificationStatus(manager, userId, VerificationStatus.APPROVED);
    }
  }

  /**
   * Cierra la revisión de datos: aprobada, la foto y el nombre pendientes reemplazan a los actuales;
   * rechazada, se descartan.
   */
  private async resolveProfileReview(
    manager: EntityManager,
    subject: User,
    approve: boolean,
  ): Promise<StoredFile[]> {
    const users = manager.getRepository(User);
    const pendingAvatar = subject.pendingAvatarFileId;
    const pendingName =
      subject.pendingFirstName && subject.pendingLastName
        ? { firstName: subject.pendingFirstName, lastName: subject.pendingLastName }
        : null;
    await users.update(subject.id, {
      pendingAvatarFileId: null,
      pendingFirstName: null,
      pendingLastName: null,
      ...(approve && pendingAvatar && { avatarFileId: pendingAvatar }),
      ...(approve && pendingName),
    });
    if (!pendingAvatar) return [];
    if (!approve) return this.uploads.markDeleted(manager, [pendingAvatar]);
    return this.uploads.markDeleted(manager, subject.avatarFileId ? [subject.avatarFileId] : []);
  }

  private async closeOpenProfileReview(
    manager: EntityManager,
    adminId: string,
    userId: string,
    reasonCode: string,
  ): Promise<void> {
    await manager.getRepository(IdentityVerification).update(
      { userId, kind: VerificationKind.PROFILE_CHANGE, status: VerificationStatus.REQUIRES_REVIEW },
      {
        status: VerificationStatus.REJECTED,
        decisionSource: DecisionSource.ADMIN,
        decidedBy: adminId,
        decidedAt: new Date(),
        reasonCode,
      },
    );
  }

  private async nextAttemptNumber(manager: EntityManager, userId: string): Promise<number> {
    const rows: Array<{ last: number | null }> = await manager.query(
      'SELECT max(attempt_number) AS last FROM identity_verifications WHERE user_id = $1',
      [userId],
    );
    return (rows[0]?.last ?? 0) + 1;
  }

  /** Requisitos para verificar la identidad (ADR 0006): email verificado y foto de perfil. */
  private assertProfileComplete(user: User): void {
    const missing: ApiErrorDetail[] = [];
    if (!user.emailVerifiedAt) {
      missing.push({ field: 'email', errors: ['Falta verificar el email.'] });
    }
    if (!user.avatarFileId) {
      missing.push({ field: 'avatar', errors: ['Falta la foto de perfil.'] });
    }
    if (missing.length) {
      throw new UnprocessableEntityException({
        code: 'PROFILE_INCOMPLETE',
        message: 'Completá tu perfil antes de verificar la identidad.',
        details: missing,
      });
    }
  }

  private async subjectsOf(userIds: string[]): Promise<Map<string, VerificationSubjectDto>> {
    const subjects = new Map<string, VerificationSubjectDto>();
    if (!userIds.length) return subjects;
    const users = await this.dataSource
      .getRepository(User)
      .findBy({ id: In([...new Set(userIds)]) });
    const avatars = await this.uploads.publicUrls(
      users.flatMap((u) => [u.avatarFileId, u.pendingAvatarFileId].filter((id) => id !== null)),
    );
    for (const u of users) {
      subjects.set(u.id, {
        id: u.id,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        avatarUrl: u.avatarFileId ? (avatars.get(u.avatarFileId) ?? null) : null,
        pendingFirstName: u.pendingFirstName,
        pendingLastName: u.pendingLastName,
        pendingAvatarUrl: u.pendingAvatarFileId
          ? (avatars.get(u.pendingAvatarFileId) ?? null)
          : null,
      });
    }
    return subjects;
  }

  /** Bloquea la fila del usuario (FOR UPDATE) para serializar las operaciones de verificación. */
  private async lockSubject(manager: EntityManager, userId: string): Promise<boolean> {
    const rows: Array<{ id: string }> = await manager.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [userId],
    );
    return rows.length > 0;
  }

  /**
   * Replica el estado en `users.verification_status` y ajusta el estado de la cuenta: APPROVED
   * activa una cuenta PENDING_VERIFICATION; REVOKED devuelve una ACTIVE a PENDING_VERIFICATION.
   * Nunca toca cuentas SUSPENDED, BANNED o DEACTIVATED.
   */
  private async applyVerificationStatus(
    manager: EntityManager,
    userId: string,
    status: VerificationStatus,
  ): Promise<void> {
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

  private findOpenAttempt(userId: string): Promise<IdentityVerification | null> {
    return this.dataSource
      .getRepository(IdentityVerification)
      .findOneBy({ userId, kind: VerificationKind.IDENTITY, status: In([...OPEN_STATUSES]) });
  }

  private findLatest(userId: string): Promise<IdentityVerification | null> {
    return this.dataSource
      .getRepository(IdentityVerification)
      .findOne({ where: { userId }, order: { attemptNumber: 'DESC' } });
  }

  private async lockVerification(
    manager: EntityManager,
    id: string,
  ): Promise<IdentityVerification> {
    const verification = await manager
      .getRepository(IdentityVerification)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!verification) throw new NotFoundException();
    return verification;
  }

  private toStartResponse(
    v: IdentityVerification,
    alreadyInProgress: boolean,
    redirectUrl: string | null,
    clientToken: string | null,
  ): StartVerificationResponseDto {
    return {
      ...VerificationResponseDto.from(v),
      alreadyInProgress,
      redirectUrl,
      clientToken,
      manualReview: this.provider.manualOnly,
    };
  }

  private auditEntry(
    admin: AuthUser,
    v: IdentityVerification,
    dto: AdminDecisionDto,
    result: 'SUCCESS' | 'DENIED',
  ) {
    return {
      actorId: admin.id,
      action: `IDENTITY_VERIFICATION_${dto.decision}`,
      targetType: 'IDENTITY_VERIFICATION',
      targetId: v.id,
      reason: dto.reason,
      result,
      metadata: { userId: v.userId, status: v.status },
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
    );
  }
}

function hasPendingChanges(user: User): boolean {
  return user.pendingAvatarFileId !== null || user.pendingFirstName !== null;
}
