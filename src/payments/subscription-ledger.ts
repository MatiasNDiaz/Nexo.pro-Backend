import { SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { PaymentPurpose } from './entities/payment.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cada pago aprobado de un mes da 30 días (ADR 0026). */
export const PERIOD_DAYS = 30;
/** Se puede pagar el mes siguiente desde 7 días antes del vencimiento. */
export const RENEWAL_WINDOW_DAYS = 7;
/** Subir de plan pagando la diferencia: dentro de los 10 días del último pago (C-24). */
export const UPGRADE_WINDOW_DAYS = 10;

export interface LedgerPayment {
  id: string;
  purpose: PaymentPurpose;
  planId: string;
  amount: string;
  appliedAt: Date;
}

export interface LedgerPlanChange {
  planId: string;
  at: Date;
}

export interface LedgerInput {
  trialPlanId: string;
  trialEndsAt: Date | null;
  /** Pagos aplicados y no revertidos. */
  payments: LedgerPayment[];
  /** Cambios de plan del admin. */
  planChanges: LedgerPlanChange[];
  now: Date;
}

/** Lo que dio un pago de un mes: el tramo pago y desde cuándo rige su plan. */
export interface LedgerGrant {
  from: Date;
  until: Date;
  startsAt: Date;
}

export interface LedgerState {
  status: SubscriptionStatus;
  planId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodAmountPaid: string | null;
  /** Último pago de un mes, mientras el período está vigente (para la ventana de 10 días). */
  lastPaymentAt: Date | null;
  grants: Map<string, LedgerGrant>;
  /** Diferencias que ya no aplican porque se revirtió el pago del mes que mejoraban. */
  orphanUpgrades: string[];
}

export const toCents = (amount: string): number => Math.round(Number(amount) * 100);
export const fromCents = (cents: number): string => (cents / 100).toFixed(2);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/**
 * Estado de la suscripción a partir de la prueba, los pagos aplicados y los cambios del admin
 * (ADR 0026). Se recalcula entero en cada cambio, así revertir un pago es sacarlo de la lista:
 *
 * - Pago de un mes **con un período pago vigente** (renovación): suma 30 días al final y su plan
 *   rige desde ese final.
 * - **Durante la prueba**: el plan rige en el momento y el período termina 30 días después del fin
 *   de la prueba (no se pierden días). **Vencida**: 30 días desde el pago.
 * - **Diferencia de mejora**: el plan rige en el momento, sin sumar días.
 * - El plan vigente es el del último pago (o cambio del admin) que ya empezó a regir.
 */
export function computeLedger(input: LedgerInput): LedgerState {
  const { now, trialEndsAt } = input;
  const payments = [...input.payments].sort(
    (a, b) => a.appliedAt.getTime() - b.appliedAt.getTime(),
  );
  const grants = new Map<string, LedgerGrant>();
  const orphanUpgrades: string[] = [];
  const switches = input.planChanges
    .filter((change) => change.at <= now)
    .map((change) => ({ at: change.at.getTime(), planId: change.planId }));

  let paidEnd: Date | null = null;
  let lastPayment: LedgerPayment | null = null;
  let paidCents = 0;
  for (const payment of payments) {
    const at = payment.appliedAt;
    const covered = paidEnd !== null && paidEnd > at;
    if (payment.purpose === PaymentPurpose.SUBSCRIPTION) {
      const from: Date = covered ? paidEnd! : trialEndsAt && trialEndsAt > at ? trialEndsAt : at;
      const until = addDays(from, PERIOD_DAYS);
      const startsAt = covered ? paidEnd! : at;
      grants.set(payment.id, { from, until, startsAt });
      paidEnd = until;
      lastPayment = payment;
      paidCents = toCents(payment.amount);
      if (startsAt <= now) switches.push({ at: at.getTime(), planId: payment.planId });
    } else if (covered) {
      paidCents += toCents(payment.amount);
      switches.push({ at: at.getTime(), planId: payment.planId });
    } else {
      orphanUpgrades.push(payment.id);
    }
  }

  // Tramo sin cortes que termina en el último pago: cada renovación empieza donde terminó el anterior.
  let periodStart: Date | null = null;
  let previousUntil: number | null = null;
  for (const grant of grants.values()) {
    if (previousUntil === null || grant.startsAt.getTime() !== previousUntil) {
      periodStart = grant.startsAt;
    }
    previousUntil = grant.until.getTime();
  }

  const active = paidEnd !== null && periodStart !== null && periodStart <= now && now < paidEnd;
  const status = active
    ? SubscriptionStatus.ACTIVE
    : trialEndsAt && trialEndsAt > now && grants.size === 0
      ? SubscriptionStatus.TRIAL
      : SubscriptionStatus.EXPIRED;
  const latest = switches.reduce<{ at: number; planId: string } | null>(
    (best, item) => (best === null || item.at >= best.at ? item : best),
    null,
  );

  return {
    status,
    planId: latest?.planId ?? input.trialPlanId,
    periodStart,
    periodEnd: paidEnd,
    periodAmountPaid: active ? fromCents(paidCents) : null,
    lastPaymentAt: active ? lastPayment!.appliedAt : null,
    grants,
    orphanUpgrades,
  };
}

export type QuoteUnavailable = 'RENEWAL_NOT_YET' | 'UPGRADE_WINDOW_CLOSED' | 'FREE_PLAN';

export type Quote =
  | { available: true; purpose: PaymentPurpose; amount: string }
  | { available: false; reason: QuoteUnavailable };

/**
 * Qué se paga para pasar a un plan (ADR 0026):
 * - en prueba o vencida: el mes completo;
 * - con período vigente, si el plan cuesta más de lo pagado y no pasaron 10 días del último pago:
 *   la diferencia, con cambio inmediato;
 * - si no, el mes siguiente, desde 7 días antes del vencimiento (el plan nuevo rige al empezarlo).
 */
export function quotePlan(
  state: Pick<
    LedgerState,
    'status' | 'planId' | 'periodEnd' | 'periodAmountPaid' | 'lastPaymentAt'
  >,
  target: { id: string; priceAmount: string },
  now: Date,
): Quote {
  const price = toCents(target.priceAmount);
  if (price <= 0) return { available: false, reason: 'FREE_PLAN' };
  if (state.status !== SubscriptionStatus.ACTIVE || !state.periodEnd || state.periodEnd <= now) {
    return { available: true, purpose: PaymentPurpose.SUBSCRIPTION, amount: fromCents(price) };
  }
  const paid = toCents(state.periodAmountPaid ?? '0');
  const isUpgrade = target.id !== state.planId && price > paid;
  if (
    isUpgrade &&
    state.lastPaymentAt &&
    now.getTime() - state.lastPaymentAt.getTime() <= UPGRADE_WINDOW_DAYS * DAY_MS
  ) {
    return {
      available: true,
      purpose: PaymentPurpose.UPGRADE_DIFFERENCE,
      amount: fromCents(price - paid),
    };
  }
  if (state.periodEnd.getTime() - now.getTime() <= RENEWAL_WINDOW_DAYS * DAY_MS) {
    return { available: true, purpose: PaymentPurpose.SUBSCRIPTION, amount: fromCents(price) };
  }
  return { available: false, reason: isUpgrade ? 'UPGRADE_WINDOW_CLOSED' : 'RENEWAL_NOT_YET' };
}
