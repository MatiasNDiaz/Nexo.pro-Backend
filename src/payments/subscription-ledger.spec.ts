import { SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { PaymentPurpose } from './entities/payment.entity';
import { computeLedger, type LedgerPayment, quotePlan } from './subscription-ledger';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-01T12:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * DAY);

const BASIC = 'basic';
const MEDIUM = 'medium';
const PREMIUM = 'premium';

const month = (id: string, planId: string, at: number, amount = '10000.00'): LedgerPayment => ({
  id,
  purpose: PaymentPurpose.SUBSCRIPTION,
  planId,
  amount,
  appliedAt: day(at),
});
const upgrade = (id: string, planId: string, at: number, amount: string): LedgerPayment => ({
  id,
  purpose: PaymentPurpose.UPGRADE_DIFFERENCE,
  planId,
  amount,
  appliedAt: day(at),
});

/** Profesional registrado el día 0: prueba hasta el día 30. */
const ledger = (
  payments: LedgerPayment[],
  now: number,
  planChanges = [] as { planId: string; at: number }[],
) =>
  computeLedger({
    trialPlanId: BASIC,
    trialEndsAt: day(30),
    payments,
    planChanges: planChanges.map((c) => ({ planId: c.planId, at: day(c.at) })),
    now: day(now),
  });

describe('computeLedger (ADR 0026)', () => {
  it('sin pagos: prueba con Basic y después vencida', () => {
    expect(ledger([], 10)).toMatchObject({ status: SubscriptionStatus.TRIAL, planId: BASIC });
    expect(ledger([], 31)).toMatchObject({ status: SubscriptionStatus.EXPIRED, planId: BASIC });
  });

  it('pagar durante la prueba: el plan rige ya y el período termina 30 días después de la prueba', () => {
    const state = ledger([month('p1', PREMIUM, 10, '20000.00')], 10);
    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      planId: PREMIUM,
      periodStart: day(10),
      periodEnd: day(60),
      periodAmountPaid: '20000.00',
      lastPaymentAt: day(10),
    });
    expect(state.grants.get('p1')).toEqual({ from: day(30), until: day(60), startsAt: day(10) });
  });

  it('vencida: el período empieza al pagar', () => {
    const state = ledger([month('p1', BASIC, 40)], 41);
    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      periodStart: day(40),
      periodEnd: day(70),
    });
    expect(ledger([month('p1', BASIC, 40)], 70).status).toBe(SubscriptionStatus.EXPIRED);
  });

  it('renovar antes de vencer suma 30 días al final, sin perder los que quedan', () => {
    const payments = [month('p1', BASIC, 40), month('p2', BASIC, 65)];
    const state = ledger(payments, 66);
    expect(state).toMatchObject({ periodStart: day(40), periodEnd: day(100) });
    expect(state.grants.get('p2')).toEqual({ from: day(70), until: day(100), startsAt: day(70) });
  });

  it('bajar de plan: el plan nuevo rige recién cuando empieza el mes pagado', () => {
    const payments = [month('p1', PREMIUM, 40, '20000.00'), month('p2', BASIC, 65)];
    expect(ledger(payments, 69).planId).toBe(PREMIUM);
    expect(ledger(payments, 70).planId).toBe(BASIC);
    expect(ledger(payments, 70).periodAmountPaid).toBe('10000.00');
  });

  it('diferencia de mejora: cambio inmediato y suma a lo pagado, sin sumar días', () => {
    const payments = [month('p1', BASIC, 40), upgrade('u1', PREMIUM, 45, '10000.00')];
    expect(ledger(payments, 46)).toMatchObject({
      planId: PREMIUM,
      periodEnd: day(70),
      periodAmountPaid: '20000.00',
    });
  });

  it('la mejora sigue en el mes pagado por adelantado antes de la mejora', () => {
    const payments = [
      month('p1', BASIC, 40),
      month('p2', BASIC, 65),
      upgrade('u1', PREMIUM, 66, '10000.00'),
    ];
    expect(ledger(payments, 71).planId).toBe(PREMIUM);
  });

  it('revertir el pago hecho en la prueba la devuelve a la prueba con Basic', () => {
    const paid = ledger([month('p1', PREMIUM, 10, '20000.00')], 15);
    expect(paid).toMatchObject({ status: SubscriptionStatus.ACTIVE, planId: PREMIUM });
    // Revertir es recalcular sin ese pago: lo que queda es la prueba.
    expect(ledger([], 15)).toMatchObject({
      status: SubscriptionStatus.TRIAL,
      planId: BASIC,
      periodEnd: null,
      periodAmountPaid: null,
    });
  });

  it('revertir un mes corre los pagos posteriores', () => {
    const remaining = [month('p2', BASIC, 65)];
    const state = ledger(remaining, 66);
    // Sin p1 (días 40–70), p2 pasa a empezar al pagarse.
    expect(state.grants.get('p2')).toEqual({ from: day(65), until: day(95), startsAt: day(65) });
    expect(state.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('una mejora sin período vigente no aplica', () => {
    const state = ledger([upgrade('u1', PREMIUM, 45, '10000.00')], 46);
    expect(state.orphanUpgrades).toEqual(['u1']);
    expect(state.planId).toBe(BASIC);
  });

  it('el cambio del admin rige hasta el próximo pago que elija otro plan', () => {
    const payments = [month('p1', BASIC, 40)];
    expect(ledger(payments, 50, [{ planId: MEDIUM, at: 45 }]).planId).toBe(MEDIUM);
    const renewed = [...payments, month('p2', BASIC, 65)];
    expect(ledger(renewed, 71, [{ planId: MEDIUM, at: 45 }]).planId).toBe(BASIC);
  });
});

describe('quotePlan (ADR 0026)', () => {
  const plan = (id: string, priceAmount: string) => ({ id, priceAmount });

  it('en prueba o vencida se paga el mes completo', () => {
    expect(quotePlan(ledger([], 5), plan(MEDIUM, '15000.00'), day(5))).toEqual({
      available: true,
      purpose: PaymentPurpose.SUBSCRIPTION,
      amount: '15000.00',
    });
    expect(quotePlan(ledger([], 40), plan(BASIC, '10000.00'), day(40))).toMatchObject({
      purpose: PaymentPurpose.SUBSCRIPTION,
    });
  });

  it('subir dentro de los 10 días: la diferencia; después, al renovar', () => {
    const payments = [month('p1', BASIC, 40)];
    expect(quotePlan(ledger(payments, 50), plan(PREMIUM, '20000.00'), day(50))).toEqual({
      available: true,
      purpose: PaymentPurpose.UPGRADE_DIFFERENCE,
      amount: '10000.00',
    });
    expect(quotePlan(ledger(payments, 51), plan(PREMIUM, '20000.00'), day(51))).toEqual({
      available: false,
      reason: 'UPGRADE_WINDOW_CLOSED',
    });
    expect(quotePlan(ledger(payments, 63), plan(PREMIUM, '20000.00'), day(63))).toMatchObject({
      purpose: PaymentPurpose.SUBSCRIPTION,
      amount: '20000.00',
    });
  });

  it('renovar o bajar: desde 7 días antes del vencimiento', () => {
    const state = ledger([month('p1', MEDIUM, 40, '15000.00')], 60);
    expect(quotePlan(state, plan(MEDIUM, '15000.00'), day(60))).toEqual({
      available: false,
      reason: 'RENEWAL_NOT_YET',
    });
    expect(quotePlan(state, plan(BASIC, '10000.00'), day(60))).toEqual({
      available: false,
      reason: 'RENEWAL_NOT_YET',
    });
    const soon = ledger([month('p1', MEDIUM, 40, '15000.00')], 63);
    expect(quotePlan(soon, plan(BASIC, '10000.00'), day(63))).toMatchObject({
      available: true,
      purpose: PaymentPurpose.SUBSCRIPTION,
      amount: '10000.00',
    });
  });

  it('el mismo plan nunca se cobra como diferencia', () => {
    const state = ledger([month('p1', PREMIUM, 40, '15000.00')], 41);
    expect(quotePlan(state, plan(PREMIUM, '20000.00'), day(41))).toEqual({
      available: false,
      reason: 'RENEWAL_NOT_YET',
    });
  });

  it('un plan sin costo no se cobra', () => {
    expect(quotePlan(ledger([], 5), plan(BASIC, '0.00'), day(5))).toEqual({
      available: false,
      reason: 'FREE_PLAN',
    });
  });
});
