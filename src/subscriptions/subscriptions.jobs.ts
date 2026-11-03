import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';
import { MAIL_PROVIDER, type MailProvider } from '../integrations/mail/mail-provider';
import {
  type PeriodReminderEvent,
  SubscriptionEvents,
  SubscriptionsService,
  type TrialReminderEvent,
} from './subscriptions.service';

/**
 * Todos los días a las 9:00 de Córdoba: vence pruebas cumplidas y manda los recordatorios de la
 * prueba y del período pago. Los períodos pagos los vence la tarea de pagos (cada hora).
 */
@Injectable()
export class TrialsJob {
  private readonly logger = new Logger(TrialsJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Cron('0 9 * * *', {
    name: 'trials',
    timeZone: 'America/Argentina/Cordoba',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.TRIALS, async () => ({
        expired: await this.subscriptions.expireTrials(),
        reminded:
          (await this.subscriptions.sendTrialReminders()) +
          (await this.subscriptions.sendPeriodReminders()),
      }));
      if (outcome.ran) {
        this.logger.log(
          `Pruebas vencidas: ${outcome.result.expired}; recordatorios: ${outcome.result.reminded}`,
        );
      }
    } catch (error) {
      this.logger.error('Falló la tarea de pruebas', error as Error);
    }
  }
}

/** Email del recordatorio. Si falla, se registra sin datos personales (no se reintenta). */
@Injectable()
export class SubscriptionMailListener {
  private readonly logger = new Logger(SubscriptionMailListener.name);

  constructor(@Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  @OnEvent(SubscriptionEvents.TRIAL_REMINDER, { promisify: true })
  async onTrialReminder(event: TrialReminderEvent): Promise<void> {
    const date = event.trialEndsAt.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Cordoba',
    });
    const days = event.daysLeft === 1 ? '1 día' : `${event.daysLeft} días`;
    try {
      await this.mail.send({
        to: event.email,
        subject: `Te quedan ${days} de prueba`,
        text: `Hola ${event.firstName}:\n\nTu prueba gratuita termina el ${date} (te quedan ${days}). Después tu perfil deja de mostrarse hasta que elijas un plan. No se borra nada.`,
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el recordatorio de la prueba', error);
    }
  }

  @OnEvent(SubscriptionEvents.PERIOD_REMINDER, { promisify: true })
  async onPeriodReminder(event: PeriodReminderEvent): Promise<void> {
    const date = event.periodEndsAt.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Cordoba',
    });
    const days = event.daysLeft === 1 ? '1 día' : `${event.daysLeft} días`;
    try {
      await this.mail.send({
        to: event.email,
        subject: `Tu plan vence en ${days}`,
        text: `Hola ${event.firstName}:\n\nTu plan está pago hasta el ${date}. Ya podés pagar el mes siguiente desde la app; los días que te quedan no se pierden. Si no lo renovás, tu perfil deja de mostrarse al vencer. No se borra nada.`,
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el recordatorio del vencimiento', error);
    }
  }
}
