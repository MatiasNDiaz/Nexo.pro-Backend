import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { AUDIT_LOGGER, AuditLogger } from '../common/audit/audit-logger';
import { AuthUser } from '../common/decorators';
import {
  IDENTITY_PROVIDER,
  IdentityVerificationProvider,
  WebhookRequest,
} from '../integrations/identity/identity-verification.provider';
import { AdminDecision, AdminDecisionDto } from './dto/admin-decision.dto';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import {
  AdminVerificationResponseDto,
  StartVerificationResponseDto,
  VerificationResponseDto,
} from './dto/verification-response.dto';
import { IdentityProviderEvent } from './entities/identity-provider-event.entity';
import { IdentityVerification } from './entities/identity-verification.entity';
import { IDENTITY_SUBJECTS, IdentitySubjects } from './identity-subjects.gateway';
import { canTransition, OPEN_STATUSES } from './verification-state-machine';
import { DecisionSource, VerificationStatus } from './verification-status.enum';

export const IDENTITY_VERIFICATION_OPTIONS = Symbol('IDENTITY_VERIFICATION_OPTIONS');
export interface IdentityVerificationOptions {
  /** Intentos máximos antes de requerir contacto con soporte. */
  maxAttempts: number;
}

/** Evento emitido después del commit. `auth` lo escucha para revocar sesiones en REVOKED. */
export const IDENTITY_DECIDED_EVENT = 'identity.decided';
export interface IdentityDecidedEvent {
  userId: string;
  verificationId: string;
  status: VerificationStatus;
}

export type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'UNKNOWN_REFERENCE';

const PG_UNIQUE_VIOLATION = '23505';

const ADMIN_TARGET: Record<AdminDecision, VerificationStatus> = {
  APPROVE: VerificationStatus.APPROVED,
  REJECT: VerificationStatus.REJECTED,
  REVOKE: VerificationStatus.REVOKED,
};

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityVerificationProvider,
    @Inject(IDENTITY_SUBJECTS) private readonly subjects: IdentitySubjects,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(IDENTITY_VERIFICATION_OPTIONS) private readonly options: IdentityVerificationOptions,
    private readonly events: EventEmitter2,
  ) {}

  /** El usuario (cliente o profesional) inicia la verificación. Idempotente si ya hay un intento abierto. */
  async start(user: AuthUser): Promise<StartVerificationResponseDto> {
    if (user.role !== 'CUSTOMER' && user.role !== 'PROFESSIONAL') {
      throw new ForbiddenException();
    }

    const open = await this.findOpenAttempt(user.id);
    if (open) return this.toStartResponse(open, true, null, null);

    const latest = await this.findLatest(user.id);
    if (latest?.status === VerificationStatus.APPROVED) {
      throw new ConflictException({ code: 'ALREADY_VERIFIED', message: 'La identidad ya está verificada.' });
    }
    const attempts = await this.dataSource.getRepository(IdentityVerification).count({ where: { userId: user.id } });
    if (attempts >= this.options.maxAttempts) {
      throw new UnprocessableEntityException({
        code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
        message: 'Alcanzaste el máximo de intentos. Contactá a soporte.',
      });
    }

    // La sesión del proveedor se crea antes de la transacción para no retener locks durante una llamada externa.
    // Si la transacción falla después, la sesión huérfana del proveedor no tiene efecto.
    const verificationId = randomUUID();
    const session = await this.provider.createSession({ verificationId, userId: user.id });

    try {
      const created = await this.dataSource.transaction(async (manager) => {
        const subject = await this.subjects.lockForVerification(user.id, manager);
        if (!subject) throw new NotFoundException();
        const repo = manager.getRepository(IdentityVerification);
        const entity = repo.create({
          id: verificationId,
          userId: user.id,
          status: VerificationStatus.PENDING,
          provider: this.provider.name,
          providerReference: session.providerReference,
          attemptNumber: attempts + 1,
          decisionSource: null,
          reasonCode: null,
          adminNote: null,
          decidedBy: null,
          submittedAt: new Date(),
          decidedAt: null,
        });
        await repo.insert(entity);
        await this.subjects.applyVerificationStatus(user.id, VerificationStatus.PENDING, manager);
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
    const eventsRepo = this.dataSource.getRepository(IdentityProviderEvent);

    let event = await eventsRepo.findOne({ where: { provider: this.provider.name, eventId: notice.eventId } });
    if (event?.processedAt) return 'DUPLICATE';
    if (!event) {
      try {
        event = await eventsRepo.save(
          eventsRepo.create({ provider: this.provider.name, eventId: notice.eventId, verificationId: null }),
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) return 'DUPLICATE'; // otro worker lo está procesando
        throw error;
      }
    }

    const verification = await this.dataSource.getRepository(IdentityVerification).findOne({
      where: { provider: this.provider.name, providerReference: notice.providerReference },
    });
    if (!verification) {
      await eventsRepo.update(event.id, { processedAt: new Date(), processingError: 'UNKNOWN_REFERENCE' });
      this.logger.warn(`Webhook de identidad con referencia desconocida (evento ${event.id})`);
      return 'UNKNOWN_REFERENCE';
    }

    const decision = await this.provider.fetchDecision(notice.providerReference);
    const target = decision.outcome === 'PENDING' ? null : VerificationStatus[decision.outcome];
    const eventId = event.id;

    try {
      const changed = await this.dataSource.transaction(async (manager) => {
        await this.subjects.lockForVerification(verification.userId, manager);
        const current = await this.lockVerification(verification.id, manager);
        let applied: IdentityVerification | null = null;
        if (target && canTransition(current.status, target, 'PROVIDER')) {
          current.status = target;
          current.decisionSource = target === VerificationStatus.REQUIRES_REVIEW ? null : DecisionSource.PROVIDER;
          current.decidedAt = target === VerificationStatus.REQUIRES_REVIEW ? null : new Date();
          current.reasonCode = decision.reasonCode;
          applied = await manager.getRepository(IdentityVerification).save(current);
          await this.subjects.applyVerificationStatus(current.userId, target, manager);
        }
        await manager
          .getRepository(IdentityProviderEvent)
          .update(eventId, { verificationId: current.id, processedAt: new Date(), processingError: null });
        return applied;
      });
      if (!changed) return 'IGNORED';
      this.emitDecided(changed);
      return 'PROCESSED';
    } catch (error) {
      // Queda sin processed_at para que el reintento del proveedor lo vuelva a procesar.
      await eventsRepo.update(eventId, { processingError: 'PROCESSING_FAILED' });
      throw error;
    }
  }

  /** Decisión manual del admin. Motivo obligatorio y auditoría en la misma transacción. */
  async adminDecide(admin: AuthUser, verificationId: string, dto: AdminDecisionDto): Promise<AdminVerificationResponseDto> {
    if (admin.role !== 'ADMIN') throw new ForbiddenException();
    const target = ADMIN_TARGET[dto.decision];

    const updated = await this.dataSource.transaction(async (manager) => {
      const found = await manager.getRepository(IdentityVerification).findOne({ where: { id: verificationId } });
      if (!found) throw new NotFoundException();
      await this.subjects.lockForVerification(found.userId, manager);
      const current = await this.lockVerification(verificationId, manager);

      if (!canTransition(current.status, target, 'ADMIN')) {
        await this.audit.record(this.auditEntry(admin, current, dto, 'DENIED'));
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `No se puede pasar de ${current.status} a ${target}.`,
        });
      }

      current.status = target;
      current.decisionSource = DecisionSource.ADMIN;
      current.decidedBy = admin.id;
      current.decidedAt = new Date();
      current.reasonCode = dto.reasonCode ?? current.reasonCode;
      current.adminNote = dto.adminNote ?? current.adminNote;
      const saved = await manager.getRepository(IdentityVerification).save(current);
      await this.subjects.applyVerificationStatus(current.userId, target, manager);
      await this.audit.record(this.auditEntry(admin, saved, dto, 'SUCCESS'), manager);
      return saved;
    });

    this.emitDecided(updated);
    return AdminVerificationResponseDto.fromAdmin(updated);
  }

  async adminList(query: ListVerificationsQueryDto) {
    const [rows, total] = await this.dataSource.getRepository(IdentityVerification).findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { submittedAt: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      data: rows.map((v) => AdminVerificationResponseDto.fromAdmin(v)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ---------------------------------------------------------------------------------------------

  private findOpenAttempt(userId: string): Promise<IdentityVerification | null> {
    return this.dataSource
      .getRepository(IdentityVerification)
      .findOne({ where: { userId, status: In([...OPEN_STATUSES]) } });
  }

  private findLatest(userId: string): Promise<IdentityVerification | null> {
    return this.dataSource
      .getRepository(IdentityVerification)
      .findOne({ where: { userId }, order: { attemptNumber: 'DESC' } });
  }

  private async lockVerification(id: string, manager: EntityManager): Promise<IdentityVerification> {
    const v = await manager
      .getRepository(IdentityVerification)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!v) throw new NotFoundException();
    return v;
  }

  private toStartResponse(
    v: IdentityVerification,
    alreadyInProgress: boolean,
    redirectUrl: string | null,
    clientToken: string | null,
  ): StartVerificationResponseDto {
    const dto = Object.assign(new StartVerificationResponseDto(), VerificationResponseDto.from(v));
    dto.alreadyInProgress = alreadyInProgress;
    dto.redirectUrl = redirectUrl;
    dto.clientToken = clientToken;
    dto.manualReview = this.provider.manualOnly;
    return dto;
  }

  private auditEntry(admin: AuthUser, v: IdentityVerification, dto: AdminDecisionDto, result: 'SUCCESS' | 'DENIED') {
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

  private emitDecided(v: IdentityVerification): void {
    const payload: IdentityDecidedEvent = { userId: v.userId, verificationId: v.id, status: v.status };
    this.events.emit(IDENTITY_DECIDED_EVENT, payload);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
    );
  }
}
