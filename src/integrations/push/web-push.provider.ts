import webpush from 'web-push';
import type { PushMessage, PushOutcome, PushProvider, PushTarget } from './push-provider';

/** Corta un servicio de push que no responde, para no trabar los demás envíos. */
const TIMEOUT_MS = 10_000;

/** Push real con `web-push` (cifrado RFC 8291 y firma VAPID). */
export class WebPushProvider implements PushProvider {
  constructor(private readonly vapid: { publicKey: string; privateKey: string; subject: string }) {}

  get publicKey(): string {
    return this.vapid.publicKey;
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        message.payload,
        {
          vapidDetails: this.vapid,
          TTL: message.ttlSec,
          urgency: message.urgency,
          timeout: TIMEOUT_MS,
        },
      );
      return 'SENT';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'GONE' : 'FAILED';
    }
  }
}
