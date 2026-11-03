import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { WebPushProvider } from './web-push.provider';

/** Claves de un navegador de mentira (P-256 + secreto de 16 bytes), como las de `toJSON()`. */
function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

describe('WebPushProvider (librería real, sin internet)', () => {
  const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:soporte@example.com' };
  const provider = new WebPushProvider(vapid);

  it('expone la clave pública VAPID con el formato que pide el navegador', () => {
    expect(provider.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
  });

  it('cifra y firma; si el servicio no responde, la suscripción no se da por perdida', async () => {
    // Puerto cerrado: falla la conexión después de cifrar y firmar (no hay código HTTP).
    const outcome = await provider.send(
      { endpoint: 'https://127.0.0.1:1/push', ...browserKeys() },
      { payload: JSON.stringify({ title: 'Hola' }), ttlSec: 60, urgency: 'high' },
    );
    expect(outcome).toBe('FAILED');
  });
});
