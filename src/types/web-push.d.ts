/**
 * Tipos mínimos de `web-push` 3.6.7 (el paquete no trae los suyos). Solo lo que usa
 * `WebPushProvider`; se escribieron contra `node_modules/web-push/src` para no sumar `@types/web-push`.
 * Los errores HTTP del servicio de push llegan como `WebPushError` con `statusCode`.
 */
declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface RequestOptions {
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    timeout?: number;
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  interface WebPush {
    sendNotification(
      subscription: PushSubscription,
      payload?: string | Buffer | null,
      options?: RequestOptions,
    ): Promise<SendResult>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  }

  const webpush: WebPush;
  export default webpush;
}
