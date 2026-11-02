import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, LessThanOrEqual, MoreThan } from 'typeorm';
import type { SubscriptionSummaryDto } from './dto/subscription.dto';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  Subscription,
  SubscriptionHistory,
  SubscriptionStatus,
} from './entities/subscription.entity';

/** Prueba de 30 días desde el registro (ADR 0017), con los límites del plan Basic. */
export const TRIAL_DAYS = 30;
export const TRIAL_PLAN_CODE = 'BASIC';
/** Días antes del fin de la prueba en que se avisa (confirmados el 02/11/2026). */
export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export const SubscriptionEvents = {
  TRIAL_REMINDER: 'subscriptions.trial-reminder',
} as const;

export interface TrialReminderEvent {
  email: string;
  firstName: string;
  daysLeft: number;
  trialEndsAt: Date;
}

/** Recordatorio que corresponde con esos días restantes (el menor umbral alcanzado), o null. */
export function trialReminderFor(daysLeft: number): number | null {
  const due = TRIAL_REMINDER_DAYS.filter((threshold) => daysLeft <= threshold);
  return due.length ? Math.min(...due) : null;
}

/** Días restantes redondeados hacia arriba: 30 al registrarse, 1 durante el último día. */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Suscripciones del profesional. En la etapa 7.2 solo hay pruebas; los pagos con Mercado Pago
 * llegan en la etapa 9. Los límites del plan se leen siempre de `subscription_plans`.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Da la prueba de 30 días si el usuario nunca tuvo una suscripción (FI §6.2: una sola prueba por
   * persona). Corre en la transacción del llamador (registro o cambio de rol). Devuelve si la dio.
   */
  async startTrialIfFirst(manager: EntityManager, userId: string, from: Date): Promise<boolean> {
    if (await manager.getRepository(Subscription).existsBy({ userId })) return false;
    const plan = await manager.getRepository(SubscriptionPlan).findOneBy({ code: TRIAL_PLAN_CODE });
    if (!plan) throw new Error(`Falta el plan ${TRIAL_PLAN_CODE}: corré npm run seed:catalogs`);
    const subscription = manager.getRepository(Subscription).create({
      userId,
      planId: plan.id,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(from.getTime() + TRIAL_DAYS * DAY_MS),
    });
    await manager.getRepository(Subscription).insert(subscription);
    await manager.getRepository(SubscriptionHistory).insert({
      subscriptionId: subscription.id,
      event: 'TRIAL_STARTED',
      toPlanId: plan.id,
      toStatus: SubscriptionStatus.TRIAL,
    });
    return true;
  }

  /**
   * Plan vigente (prueba o pago), o null si no tiene: sin plan no puede cargar contenido ni aparece
   * en el catálogo. Una prueba vencida que la tarea diaria todavía no marcó ya no cuenta.
   */
  async livePlan(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
    now = new Date(),
  ): Promise<SubscriptionPlan | null> {
    const subscription = await this.liveSubscription(manager, userId);
    if (!subscription?.plan) return null;
    if (subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt! <= now) {
      return null;
    }
    return subscription.plan;
  }

  /** Lo que ve el profesional: plan, estado y contador de la prueba. */
  async summary(userId: string, now = new Date()): Promise<SubscriptionSummaryDto> {
    const subscription = await this.dataSource.getRepository(Subscription).findOne({
      where: { userId },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
    });
    if (!subscription?.plan) {
      return { status: null, live: false, plan: null, trialEndsAt: null, trialDaysLeft: null };
    }
    const plan = await this.livePlan(userId, this.dataSource.manager, now);
    const { plan: current } = subscription;
    return {
      status: subscription.status,
      live: plan !== null,
      plan: {
        code: current.code,
        name: current.name,
        maxProfessions: current.maxProfessions,
        maxImages: current.maxImages,
        maxVideos: current.maxVideos,
        maxVideoSeconds: current.maxVideoSeconds,
        maxImageBytes: current.maxImageBytes,
        maxVideoBytes: current.maxVideoBytes,
        themeLevel: current.themeLevel,
      },
      trialEndsAt: subscription.trialEndsAt,
      trialDaysLeft:
        subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt
          ? daysUntil(subscription.trialEndsAt, now)
          : null,
    };
  }

  /** Vence las pruebas cumplidas (tarea diaria). El perfil se oculta; no se borra nada (FI §6.2). */
  async expireTrials(now = new Date()): Promise<number> {
    const due = await this.dataSource.getRepository(Subscription).findBy({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: LessThanOrEqual(now),
    });
    let expired = 0;
    for (const subscription of due) {
      await this.dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(Subscription)
          .update(
            { id: subscription.id, status: SubscriptionStatus.TRIAL },
            { status: SubscriptionStatus.EXPIRED },
          );
        if (!result.affected) return;
        await manager.getRepository(SubscriptionHistory).insert({
          subscriptionId: subscription.id,
          event: 'TRIAL_EXPIRED',
          fromPlanId: subscription.planId,
          fromStatus: SubscriptionStatus.TRIAL,
          toStatus: SubscriptionStatus.EXPIRED,
        });
        expired++;
      });
    }
    return expired;
  }

  /**
   * Recordatorios de fin de prueba a los 7, 3 y 1 días (tarea diaria). Cada umbral se avisa una sola
   * vez; si la tarea no corrió un día, se manda el que corresponde a los días que quedan.
   */
  async sendTrialReminders(now = new Date()): Promise<number> {
    const soon = await this.dataSource.getRepository(Subscription).find({
      where: {
        status: SubscriptionStatus.TRIAL,
        trialEndsAt: MoreThan(now),
      },
      relations: { user: true },
    });
    let sent = 0;
    for (const subscription of soon) {
      const daysLeft = daysUntil(subscription.trialEndsAt!, now);
      const reminder = trialReminderFor(daysLeft);
      const last = subscription.lastTrialReminderDays;
      if (reminder === null || (last !== null && last <= reminder)) continue;
      // Condicional: si otra instancia ya lo marcó, no se manda dos veces.
      const result = await this.dataSource
        .getRepository(Subscription)
        .createQueryBuilder()
        .update()
        .set({ lastTrialReminderDays: reminder })
        .where('id = :id AND status = :status', {
          id: subscription.id,
          status: SubscriptionStatus.TRIAL,
        })
        .andWhere('(last_trial_reminder_days IS NULL OR last_trial_reminder_days > :reminder)', {
          reminder,
        })
        .execute();
      const { user } = subscription;
      if (!result.affected || !user || user.deletedAt) continue;
      const event: TrialReminderEvent = {
        email: user.email,
        firstName: user.firstName,
        daysLeft,
        trialEndsAt: subscription.trialEndsAt!,
      };
      await this.events.emitAsync(SubscriptionEvents.TRIAL_REMINDER, event);
      sent++;
    }
    return sent;
  }

  private liveSubscription(manager: EntityManager, userId: string) {
    return manager.getRepository(Subscription).findOne({
      where: { userId, status: In([...LIVE_SUBSCRIPTION_STATUSES]) },
      relations: { plan: true },
    });
  }
}
