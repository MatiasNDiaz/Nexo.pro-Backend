import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuditMetadata } from '../audit/entities/admin-audit-log.entity';
import { type PaymentsConfig, paymentsConfig } from '../config/payments.config';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentWebhookRequest,
  type ProviderPayment,
} from '../integrations/payments/payment-provider';
import {
  NotificationTarget,
  NotificationType,
  type Notification,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import {
  Subscription,
  SubscriptionHistory,
  SubscriptionHistoryEvent,
  SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import {
  type PlanChangedEvent,
  SubscriptionEvents,
  TRIAL_PLAN_CODE,
} from '../subscriptions/subscriptions.service';
import { User } from '../users/entities/user.entity';
import { AccountStatus, UserRole } from '../users/user.enums';
import type {
  AdminChangePlanDto,
  AdminPaymentItemDto,
  AdminPaymentListDto,
  AdminPaymentsQueryDto,
  CheckoutResponseDto,
  PaymentItemDto,
  PlanOptionDto,
} from './dto/payments.dto';
import {
  Payment,
  PaymentEvent,
  PaymentKind,
  PaymentPurpose,
  PaymentStatus,
} from './entities/payment.entity';
import { computeLedger, type LedgerState, quotePlan, toCents } from './subscription-ledger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que hay que hacer después del commit: avisos en tiempo real y ajuste de límites del perfil. */
interface AfterCommit {
  notifications: Notification[];
  planChangedFor: string[];
}

const emptyAfter = (): AfterCommit => ({ notifications: [], planChangedFor: [] });

const UNAVAILABLE_MESSAGES = {
  RENEWAL_NOT_YET: 'Podés pagar el mes siguiente desde 7 días antes del vencimiento.',
  UPGRADE_WINDOW_CLOSED:
    'Pasaron más de 10 días desde tu último pago: el plan nuevo lo elegís al pagar el mes siguiente.',
  FREE_PLAN: 'Ese plan no tiene costo.',
} as const;

type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'IGNORED';

/**
 * Pagos con Mercado Pago (ADR 0026): checkout manual mensual, sin débito automático, multa ni
 * interés. El webhook solo avisa: el estado real se consulta al proveedor y, antes de aplicar un
 * pago, se controla que el monto, la moneda y el plan coincidan con lo que creamos. Un reembolso o
 * contracargo revierte lo que dio el pago. Todo cambio de la suscripción queda en su historial.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    @Inject(paymentsConfig.KEY) private readonly config: PaymentsConfig,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  // ---- Profesional ------------------------------------------------------------------------------

  /** Planes con lo que costaría hoy cada uno (mes completo o diferencia) o por qué no se puede. */
  async planOptions(userId: string, now = new Date()): Promise<PlanOptionDto[]> {
    const manager = this.dataSource.manager;
    const subscription = await this.latestSubscription(manager, userId);
    const state = subscription ? await this.ledgerOf(manager, subscription, now) : null;
    const plans = await manager
      .getRepository(SubscriptionPlan)
      .find({ where: { active: true }, order: { rankingTier: 'ASC' } });
    return plans.map((plan) => {
      const option: PlanOptionDto = {
        code: plan.code,
        name: plan.name,
        price: plan.priceAmount,
        currency: plan.currency,
        current: state?.status !== SubscriptionStatus.EXPIRED && state?.planId === plan.id,
        available: false,
      };
      if (!state) return option;
      const quote = quotePlan(state, plan, now);
      return quote.available
        ? { ...option, available: true, purpose: quote.purpose, amount: quote.amount }
        : { ...option, reason: quote.reason };
    });
  }

  /** Crea el pago y el checkout de Mercado Pago. El importe sale del plan, nunca del cliente. */
  async checkout(userId: string, planCode: string, now = new Date()): Promise<CheckoutResponseDto> {
    const provider = this.requireProvider();
    const payment = await this.dataSource.transaction(async (manager) => {
      const plan = await manager
        .getRepository(SubscriptionPlan)
        .findOneBy({ code: planCode, active: true });
      if (!plan) {
        throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Ese plan no existe.' });
      }
      const subscription = await this.latestSubscription(manager, userId, true);
      if (!subscription) {
        throw new ConflictException({
          code: 'NO_SUBSCRIPTION',
          message: 'Tu cuenta no tiene una suscripción de profesional.',
        });
      }
      const quote = quotePlan(await this.ledgerOf(manager, subscription, now), plan, now);
      if (!quote.available) {
        throw new ConflictException({
          code: quote.reason,
          message: UNAVAILABLE_MESSAGES[quote.reason],
        });
      }
      const repository = manager.getRepository(Payment);
      const created = repository.create({
        userId,
        subscriptionId: subscription.id,
        planId: plan.id,
        purpose: quote.purpose,
        amount: quote.amount,
        currency: plan.currency,
        provider: provider.name,
      });
      await repository.insert(created);
      return { ...created, plan };
    });

    let session: { preferenceId: string; checkoutUrl: string };
    try {
      session = await provider.createCheckout({
        paymentId: payment.id,
        title:
          payment.purpose === PaymentPurpose.UPGRADE_DIFFERENCE
            ? `Nexo PRO: mejora al plan ${payment.plan.name}`
            : `Nexo PRO: plan ${payment.plan.name} (30 días)`,
        planCode: payment.plan.code,
        amount: payment.amount,
        currency: payment.currency,
        notificationUrl: this.config.notificationUrl,
        returnUrl: this.config.returnUrl,
      });
    } catch (error) {
      this.logger.error(`No se pudo crear el checkout del pago ${payment.id}`, error as Error);
      await this.dataSource
        .getRepository(Payment)
        .update(payment.id, { status: PaymentStatus.CANCELLED });
      throw new BadGatewayException({
        code: 'PAYMENT_PROVIDER_ERROR',
        message: 'Mercado Pago no está respondiendo. Probá de nuevo en unos minutos.',
      });
    }
    await this.dataSource
      .getRepository(Payment)
      .update(payment.id, { providerPreferenceId: session.preferenceId });
    return {
      paymentId: payment.id,
      purpose: payment.purpose,
      amount: payment.amount,
      currency: payment.currency,
      checkoutUrl: session.checkoutUrl,
    };
  }

  async mine(userId: string): Promise<PaymentItemDto[]> {
    const payments = await this.dataSource.getRepository(Payment).find({
      where: { userId, status: Not(PaymentStatus.CREATED) },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return payments.map((payment) => this.item(payment));
  }

  // ---- Webhook ----------------------------------------------------------------------------------

  /**
   * Aviso de Mercado Pago. Se valida la firma, se guarda una sola vez por id de aviso y se consulta
   * el estado real del pago. Si el proveedor no responde, se responde error para que reintente.
   */
  async handleWebhook(request: PaymentWebhookRequest, now = new Date()): Promise<WebhookOutcome> {
    if (!this.provider) throw new NotFoundException();
    const notice = this.provider.parseWebhook(request);
    if (!notice.providerPaymentId) return 'IGNORED';

    const events = this.dataSource.getRepository(PaymentEvent);
    await events
      .createQueryBuilder()
      .insert()
      .values({
        provider: this.provider.name,
        providerEventId: notice.eventId,
        eventType: notice.eventType,
        payloadMinimized: { providerPaymentId: notice.providerPaymentId },
      })
      .orIgnore()
      .execute();
    const event = await events.findOneByOrFail({
      provider: this.provider.name,
      providerEventId: notice.eventId,
    });
    if (event.processedAt) return 'DUPLICATE';

    let info: ProviderPayment;
    try {
      info = await this.provider.fetchPayment(notice.providerPaymentId);
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar el pago ${notice.providerPaymentId}: ${String(error)}`,
      );
      await events.update(event.id, { processingError: 'PROVIDER_UNAVAILABLE' });
      throw new ServiceUnavailableException();
    }
    const result = await this.applyProviderState(info, now);
    await events.update(event.id, {
      paymentId: result.paymentId,
      processedAt: new Date(),
      processingError: result.error,
      payloadMinimized: {
        providerPaymentId: info.providerPaymentId,
        status: info.status,
      },
    });
    return 'PROCESSED';
  }

  /** Aplica el estado informado por el proveedor a nuestro pago (idempotente). */
  private async applyProviderState(
    info: ProviderPayment,
    now: Date,
  ): Promise<{ paymentId: string | null; error: string | null }> {
    const after = emptyAfter();
    const result = await this.dataSource.transaction(async (manager) => {
      const payments = manager.getRepository(Payment);
      const lock = { mode: 'pessimistic_write' as const };
      const payment =
        (info.externalReference && UUID.test(info.externalReference)
          ? await payments.findOne({ where: { id: info.externalReference }, lock })
          : null) ??
        (await payments.findOne({ where: { providerPaymentId: info.providerPaymentId }, lock }));
      if (!payment) {
        await this.alertAdmins(manager, after, null, 'PAYMENT_UNKNOWN', {
          providerPaymentId: info.providerPaymentId,
          status: info.status,
        });
        return { paymentId: null, error: 'UNKNOWN_PAYMENT' };
      }
      const outcome = await this.transition(manager, payment, info, now, after);
      return { paymentId: payment.id, error: outcome };
    });
    await this.afterCommit(after);
    return result;
  }

  private async transition(
    manager: EntityManager,
    payment: Payment,
    info: ProviderPayment,
    now: Date,
    after: AfterCommit,
  ): Promise<string | null> {
    const payments = manager.getRepository(Payment);
    const settled = [PaymentStatus.APPROVED, PaymentStatus.REFUNDED, PaymentStatus.CHARGED_BACK];

    // Otro intento de pago del mismo checkout (p. ej. rechazado y después aprobado): reemplaza al
    // anterior salvo que ese ya se haya aprobado.
    if (
      payment.providerPaymentId &&
      payment.providerPaymentId !== info.providerPaymentId &&
      settled.includes(payment.status)
    ) {
      if (info.status !== 'APPROVED') return 'OTHER_ATTEMPT';
      // Dos cobros aprobados para un mismo pago nuestro: no se aplica el segundo.
      await this.alertAdmins(manager, after, payment, 'PAYMENT_DUPLICATE_CHARGE', {
        providerPaymentId: info.providerPaymentId,
      });
      return 'DUPLICATE_CHARGE';
    }

    switch (info.status) {
      case 'APPROVED': {
        if (settled.includes(payment.status)) return null;
        await payments.update(payment.id, {
          providerPaymentId: info.providerPaymentId,
          status: PaymentStatus.APPROVED,
          approvedAt: info.approvedAt ?? now,
        });
        const plan = await manager
          .getRepository(SubscriptionPlan)
          .findOneByOrFail({ id: payment.planId });
        const mismatch = this.mismatchOf(payment, plan, info);
        if (mismatch) {
          // Control 1 (ADR 0026): si no coincide, no se aplica, se audita y se avisa al admin.
          await this.alertAdmins(manager, after, payment, 'PAYMENT_MISMATCH', mismatch);
          return 'MISMATCH';
        }
        return this.apply(manager, payment, now, after);
      }
      case 'REFUNDED':
      case 'CHARGED_BACK': {
        const status = PaymentStatus[info.status];
        if (payment.status === status) return null;
        await payments.update(payment.id, {
          providerPaymentId: info.providerPaymentId,
          status,
          // Un reembolso que después pasa a contracargo conserva la primera fecha.
          moneyReturnedAt: payment.moneyReturnedAt ?? now,
          // Si nunca nos llegó el aviso de aprobado, la plata igual entró: sin esto el panel
          // restaría una devolución sin haber sumado el cobro.
          approvedAt: payment.approvedAt ?? info.approvedAt ?? now,
        });
        if (payment.appliedAt && !payment.revertedAt) {
          await this.revert(manager, payment, info.status, now, after);
        }
        return null;
      }
      default: {
        // Pendiente, rechazado o cancelado: no pisa un pago ya aprobado.
        if (settled.includes(payment.status)) return null;
        await payments.update(payment.id, {
          providerPaymentId: info.providerPaymentId,
          status: PaymentStatus[info.status],
        });
        return null;
      }
    }
  }

  /** Diferencias entre lo que creamos y lo que informó el proveedor, o null si coincide. */
  private mismatchOf(
    payment: Payment,
    plan: SubscriptionPlan,
    info: ProviderPayment,
  ): AuditMetadata | null {
    const sameAmount = toCents(info.amount) === toCents(payment.amount);
    const sameCurrency = info.currency === payment.currency;
    const samePlan = info.planCode === plan.code;
    const sameReference = info.externalReference === null || info.externalReference === payment.id;
    if (sameAmount && sameCurrency && samePlan && sameReference) return null;
    return {
      expectedAmount: payment.amount,
      receivedAmount: info.amount,
      expectedCurrency: payment.currency,
      receivedCurrency: info.currency,
      expectedPlan: plan.code,
      receivedPlan: info.planCode,
      providerPaymentId: info.providerPaymentId,
    };
  }

  /** Aplica un pago aprobado y verificado a la suscripción. */
  private async apply(
    manager: EntityManager,
    payment: Payment,
    now: Date,
    after: AfterCommit,
  ): Promise<string | null> {
    const subscription = await this.lockSubscription(manager, payment.subscriptionId);
    const before = await this.ledgerOf(manager, subscription, now);
    if (
      payment.purpose === PaymentPurpose.UPGRADE_DIFFERENCE &&
      before.status !== SubscriptionStatus.ACTIVE
    ) {
      // La diferencia mejora un período vigente: si ya no lo hay, no se aplica y se avisa.
      await this.alertAdmins(manager, after, payment, 'PAYMENT_NOT_APPLICABLE', {
        reason: 'UPGRADE_WITHOUT_ACTIVE_PERIOD',
      });
      return 'NOT_APPLICABLE';
    }
    const kind = await this.kindOf(manager, payment, before.status);
    await manager.getRepository(Payment).update(payment.id, { appliedAt: now, kind });
    const state = await this.ledgerOf(manager, subscription, now);
    const grant = state.grants.get(payment.id);
    await manager.getRepository(Payment).update(payment.id, {
      grantedFrom: grant?.from ?? null,
      grantedUntil: grant?.until ?? null,
      previousPlanId: state.planId !== subscription.planId ? subscription.planId : null,
    });
    const event =
      payment.purpose === PaymentPurpose.UPGRADE_DIFFERENCE
        ? SubscriptionHistoryEvent.UPGRADED
        : before.status === SubscriptionStatus.ACTIVE
          ? SubscriptionHistoryEvent.RENEWED
          : SubscriptionHistoryEvent.PAYMENT_APPROVED;
    await this.persist(manager, subscription, state, after, {
      event,
      reason: `Pago ${payment.id}`,
    });
    await this.notifyProfessional(
      manager,
      after,
      subscription,
      'Pago aprobado',
      event === SubscriptionHistoryEvent.UPGRADED
        ? 'Tu plan ya está mejorado.'
        : `Tu plan está pago hasta el ${formatDate(state.periodEnd!)}.`,
    );
    return null;
  }

  /**
   * Tipo para el panel de ingresos (ADR 0030): la diferencia es una mejora; con el período vigente,
   * una renovación; si ya había pagado antes (y ese pago sigue en pie), una reactivación.
   */
  private async kindOf(
    manager: EntityManager,
    payment: Payment,
    statusBefore: SubscriptionStatus,
  ): Promise<PaymentKind> {
    if (payment.purpose === PaymentPurpose.UPGRADE_DIFFERENCE) return PaymentKind.UPGRADE;
    if (statusBefore === SubscriptionStatus.ACTIVE) return PaymentKind.RENEWAL;
    const paidBefore = await manager.getRepository(Payment).existsBy({
      userId: payment.userId,
      id: Not(payment.id),
      appliedAt: Not(IsNull()),
      revertedAt: IsNull(),
    });
    return paidBefore ? PaymentKind.REACTIVATION : PaymentKind.NEW;
  }

  /** Control 2 (ADR 0026): reembolso o contracargo de un pago aplicado. */
  private async revert(
    manager: EntityManager,
    payment: Payment,
    status: 'REFUNDED' | 'CHARGED_BACK',
    now: Date,
    after: AfterCommit,
  ): Promise<void> {
    const subscription = await this.lockSubscription(manager, payment.subscriptionId);
    await manager.getRepository(Payment).update(payment.id, { revertedAt: now });
    const state = await this.ledgerOf(manager, subscription, now);
    // Los pagos posteriores se corren: cada tramo empieza donde termina el anterior que quedó.
    for (const [paymentId, grant] of state.grants) {
      await manager
        .getRepository(Payment)
        .update(paymentId, { grantedFrom: grant.from, grantedUntil: grant.until });
    }
    const label = status === 'REFUNDED' ? 'reembolso' : 'contracargo';
    await this.persist(manager, subscription, state, after, {
      event: SubscriptionHistoryEvent.PAYMENT_REVERTED,
      reason: `Pago ${payment.id}: ${label}`,
    });
    await this.audit.record(
      {
        actorId: null,
        action: 'PAYMENT_REVERTED',
        targetType: 'PAYMENT',
        targetId: payment.id,
        reason: label,
        result: 'SUCCESS',
        metadata: {
          userId: payment.userId,
          amount: payment.amount,
          purpose: payment.purpose,
          statusAfter: state.status,
        },
      },
      manager,
    );
    await this.notifyAdmins(
      manager,
      after,
      payment.id,
      `Pago revertido por ${label}`,
      `Se revirtió lo que dio un pago de $${payment.amount}. La suscripción quedó ${state.status}.`,
    );
    await this.notifyProfessional(
      manager,
      after,
      subscription,
      'Se revirtió un pago',
      `Mercado Pago informó un ${label} de $${payment.amount}: se descontó lo que ese pago te había dado.`,
    );
  }

  // ---- Tarea periódica y admin ------------------------------------------------------------------

  /**
   * Vence los períodos cumplidos y aplica los cambios de plan pagados por adelantado al empezar su
   * período (tarea cada hora). Devuelve cuántas suscripciones cambiaron.
   */
  async refreshDue(now = new Date()): Promise<number> {
    const active = await this.dataSource
      .getRepository(Subscription)
      .findBy({ status: SubscriptionStatus.ACTIVE });
    let changed = 0;
    for (const { id } of active) {
      const after = emptyAfter();
      const did = await this.dataSource.transaction(async (manager) => {
        const subscription = await this.lockSubscription(manager, id);
        if (subscription.status !== SubscriptionStatus.ACTIVE) return false;
        const state = await this.ledgerOf(manager, subscription, now);
        return this.persist(manager, subscription, state, after);
      });
      await this.afterCommit(after);
      if (did) changed++;
    }
    return changed;
  }

  /** Cambio de plan de común acuerdo (FI §6.4): con motivo, historial y auditoría. */
  async adminChangePlan(
    adminId: string,
    userId: string,
    dto: AdminChangePlanDto,
    now = new Date(),
  ): Promise<void> {
    const after = emptyAfter();
    await this.dataSource.transaction(async (manager) => {
      const plan = await manager
        .getRepository(SubscriptionPlan)
        .findOneBy({ code: dto.planCode, active: true });
      if (!plan) {
        throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Ese plan no existe.' });
      }
      const subscription = await this.latestSubscription(manager, userId, true);
      if (!subscription || subscription.status === SubscriptionStatus.EXPIRED) {
        throw new ConflictException({
          code: 'SUBSCRIPTION_NOT_LIVE',
          message: 'El profesional no tiene una prueba ni un período vigente.',
        });
      }
      if (subscription.planId === plan.id) {
        throw new ConflictException({ code: 'SAME_PLAN', message: 'Ya tiene ese plan.' });
      }
      await manager.getRepository(SubscriptionHistory).insert({
        subscriptionId: subscription.id,
        event: SubscriptionHistoryEvent.ADMIN_CHANGE,
        fromPlanId: subscription.planId,
        toPlanId: plan.id,
        fromStatus: subscription.status,
        toStatus: subscription.status,
        actorId: adminId,
        reason: dto.reason,
        createdAt: now,
      });
      const state = await this.ledgerOf(manager, subscription, now);
      await this.persist(manager, subscription, state, after, 'recorded');
      await this.audit.record(
        {
          actorId: adminId,
          action: 'SUBSCRIPTION_PLAN_CHANGED',
          targetType: 'USER',
          targetId: userId,
          reason: dto.reason,
          result: 'SUCCESS',
          metadata: { fromPlanId: subscription.planId, toPlan: plan.code },
        },
        manager,
      );
      await this.notifyProfessional(
        manager,
        after,
        subscription,
        'Cambió tu plan',
        `Soporte cambió tu plan a ${plan.name}.`,
      );
    });
    await this.afterCommit(after);
  }

  async adminList(query: AdminPaymentsQueryDto): Promise<AdminPaymentListDto> {
    const [rows, total] = await this.dataSource.getRepository(Payment).findAndCount({
      where: {
        ...(query.userId && { userId: query.userId }),
        ...(query.status && { status: query.status }),
      },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      data: rows.map((payment): AdminPaymentItemDto => ({
        ...this.item(payment),
        userId: payment.userId,
        providerPaymentId: payment.providerPaymentId,
        needsReview: payment.status === PaymentStatus.APPROVED && payment.appliedAt === null,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  // ---- Internos ---------------------------------------------------------------------------------

  private requireProvider(): PaymentProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_UNAVAILABLE',
        message: 'Los pagos todavía no están habilitados.',
      });
    }
    return this.provider;
  }

  private latestSubscription(manager: EntityManager, userId: string, lock = false) {
    return manager.getRepository(Subscription).findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    });
  }

  private lockSubscription(manager: EntityManager, id: string) {
    return manager
      .getRepository(Subscription)
      .findOneOrFail({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  /** Estado calculado con los pagos aplicados (sin revertir) y los cambios del admin. */
  private async ledgerOf(
    manager: EntityManager,
    subscription: Subscription,
    now: Date,
  ): Promise<LedgerState> {
    // En serie: dentro de una transacción todas usan la misma conexión.
    const payments = await manager.getRepository(Payment).findBy({
      subscriptionId: subscription.id,
      appliedAt: Not(IsNull()),
      revertedAt: IsNull(),
    });
    const history = await manager.getRepository(SubscriptionHistory).find({
      where: { subscriptionId: subscription.id },
      order: { createdAt: 'ASC' },
    });
    const basic = await manager
      .getRepository(SubscriptionPlan)
      .findOneBy({ code: TRIAL_PLAN_CODE });
    const trialStarted = history.find((h) => h.event === SubscriptionHistoryEvent.TRIAL_STARTED);
    return computeLedger({
      trialPlanId: trialStarted?.toPlanId ?? basic?.id ?? subscription.planId,
      trialEndsAt: subscription.trialEndsAt,
      payments: payments.map((p) => ({
        id: p.id,
        purpose: p.purpose,
        planId: p.planId,
        amount: p.amount,
        appliedAt: p.appliedAt!,
      })),
      planChanges: history
        .filter((h) => h.event === SubscriptionHistoryEvent.ADMIN_CHANGE && h.toPlanId)
        .map((h) => ({ planId: h.toPlanId!, at: h.createdAt })),
      now,
    });
  }

  /**
   * Guarda el estado calculado. Si cambió algo, deja una fila en el historial: la del evento que
   * se pasa, ninguna (`'recorded'`: el llamador ya la escribió) o, en la tarea periódica, la que
   * corresponda (vencimiento o cambio de plan).
   */
  private async persist(
    manager: EntityManager,
    subscription: Subscription,
    state: LedgerState,
    after: AfterCommit,
    history?: { event: string; reason: string } | 'recorded',
  ): Promise<boolean> {
    const planChanged = state.planId !== subscription.planId;
    const statusChanged = state.status !== subscription.status;
    const endChanged = state.periodEnd?.getTime() !== subscription.currentPeriodEnd?.getTime();
    const changed =
      planChanged ||
      statusChanged ||
      endChanged ||
      state.periodStart?.getTime() !== subscription.currentPeriodStart?.getTime() ||
      state.periodAmountPaid !== subscription.periodAmountPaid;
    if (!changed && !history) return false;

    await manager.getRepository(Subscription).update(subscription.id, {
      status: state.status,
      planId: state.planId,
      currentPeriodStart: state.periodStart,
      currentPeriodEnd: state.periodEnd,
      periodAmountPaid: state.periodAmountPaid,
      // Con otra fecha de fin (o de vuelta a la prueba), los recordatorios empiezan de nuevo.
      ...((endChanged || statusChanged) && { lastReminderDays: null }),
    });

    const given = history === 'recorded' ? null : history;
    const event =
      history === 'recorded'
        ? null
        : (given?.event ?? (await this.automaticEvent(manager, subscription, state)));
    if (event) {
      await manager.getRepository(SubscriptionHistory).insert({
        subscriptionId: subscription.id,
        event,
        fromPlanId: subscription.planId,
        toPlanId: state.planId,
        fromStatus: subscription.status,
        toStatus: state.status,
        reason: given?.reason ?? null,
      });
    }
    if (planChanged) after.planChangedFor.push(subscription.userId);
    return true;
  }

  private async automaticEvent(
    manager: EntityManager,
    subscription: Subscription,
    state: LedgerState,
  ): Promise<string | null> {
    if (state.status === SubscriptionStatus.EXPIRED && subscription.status !== state.status) {
      return SubscriptionHistoryEvent.EXPIRED;
    }
    if (state.planId === subscription.planId) return null;
    const plans = manager.getRepository(SubscriptionPlan);
    const from = await plans.findOneByOrFail({ id: subscription.planId });
    const to = await plans.findOneByOrFail({ id: state.planId });
    return toCents(to.priceAmount) >= toCents(from.priceAmount)
      ? SubscriptionHistoryEvent.UPGRADED
      : SubscriptionHistoryEvent.DOWNGRADED;
  }

  /** Audita la alerta y avisa a los admins. */
  private async alertAdmins(
    manager: EntityManager,
    after: AfterCommit,
    payment: Payment | null,
    action:
      | 'PAYMENT_MISMATCH'
      | 'PAYMENT_NOT_APPLICABLE'
      | 'PAYMENT_UNKNOWN'
      | 'PAYMENT_DUPLICATE_CHARGE',
    metadata: AuditMetadata,
  ): Promise<void> {
    await this.audit.record(
      {
        actorId: null,
        action,
        targetType: 'PAYMENT',
        targetId: payment?.id ?? null,
        reason: null,
        result: 'FAILED',
        metadata: { ...metadata, ...(payment && { userId: payment.userId }) },
      },
      manager,
    );
    const texts = {
      PAYMENT_MISMATCH: [
        'Pago que no coincide',
        'Mercado Pago informó un monto, moneda o plan distinto al del pago creado. No se aplicó.',
      ],
      PAYMENT_NOT_APPLICABLE: [
        'Pago sin aplicar',
        'Se aprobó una diferencia de plan sin un período vigente. No se aplicó.',
      ],
      PAYMENT_UNKNOWN: [
        'Pago desconocido',
        'Mercado Pago informó un pago que no corresponde a ninguno creado por la app.',
      ],
      PAYMENT_DUPLICATE_CHARGE: [
        'Cobro duplicado',
        'Mercado Pago aprobó un segundo cobro para un pago ya aprobado. No se aplicó.',
      ],
    } as const;
    const [title, body] = texts[action];
    await this.notifyAdmins(manager, after, payment?.id ?? null, title, body);
  }

  private async notifyAdmins(
    manager: EntityManager,
    after: AfterCommit,
    paymentId: string | null,
    title: string,
    body: string,
  ): Promise<void> {
    const admins = await manager.getRepository(User).find({
      where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE, deletedAt: IsNull() },
      select: { id: true },
    });
    for (const admin of admins) {
      after.notifications.push(
        await this.notifications.create(manager, {
          userId: admin.id,
          type: NotificationType.PAYMENT_ALERT,
          title,
          body,
          targetType: paymentId ? NotificationTarget.PAYMENT : null,
          targetId: paymentId,
        }),
      );
    }
  }

  private async notifyProfessional(
    manager: EntityManager,
    after: AfterCommit,
    subscription: Subscription,
    title: string,
    body: string,
  ): Promise<void> {
    after.notifications.push(
      await this.notifications.create(manager, {
        userId: subscription.userId,
        type: NotificationType.SUBSCRIPTION_UPDATED,
        title,
        body,
        targetType: NotificationTarget.SUBSCRIPTION,
        targetId: subscription.id,
      }),
    );
  }

  /** Después del commit. Si el ajuste del perfil falla, se registra: el pago ya quedó aplicado. */
  private async afterCommit(after: AfterCommit): Promise<void> {
    this.notifications.deliver(after.notifications);
    for (const userId of new Set(after.planChangedFor)) {
      const event: PlanChangedEvent = { userId };
      try {
        await this.events.emitAsync(SubscriptionEvents.PLAN_CHANGED, event);
      } catch (error) {
        this.logger.error('No se pudieron ajustar los límites del perfil', error as Error);
      }
    }
  }

  private item(payment: Payment): PaymentItemDto {
    return {
      id: payment.id,
      planCode: payment.plan?.code ?? '',
      purpose: payment.purpose,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      applied: payment.appliedAt !== null,
      reverted: payment.revertedAt !== null,
      grantedFrom: payment.grantedFrom,
      grantedUntil: payment.grantedUntil,
      createdAt: payment.createdAt,
    };
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Cordoba' });
}
