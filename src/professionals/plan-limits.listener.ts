import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type PlanChangedEvent, SubscriptionEvents } from '../subscriptions/subscriptions.service';
import { ProfileService } from './profile.service';

/** Cuando cambia el plan vigente (pago, mejora, reversión o admin), ajusta lo visible del perfil. */
@Injectable()
export class PlanLimitsListener {
  constructor(private readonly profiles: ProfileService) {}

  @OnEvent(SubscriptionEvents.PLAN_CHANGED, { promisify: true })
  onPlanChanged(event: PlanChangedEvent): Promise<void> {
    return this.profiles.applyPlanLimits(event.userId);
  }
}
