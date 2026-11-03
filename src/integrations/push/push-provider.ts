/**
 * Notificaciones push web (ADR 0032). El navegador se suscribe con la clave pública VAPID y nos da
 * un `endpoint` del servicio de push de su fabricante; nosotros le mandamos el aviso cifrado.
 */
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  /** JSON que lee el service worker del frontend. Viaja cifrado de punta a punta. */
  payload: string;
  /** Si el dispositivo está apagado, cuánto lo guarda el servicio de push. */
  ttlSec: number;
  urgency: 'normal' | 'high';
}

/** `GONE`: la suscripción ya no existe (404/410) y hay que borrarla. */
export type PushOutcome = 'SENT' | 'GONE' | 'FAILED';

export interface PushProvider {
  readonly publicKey: string;
  send(target: PushTarget, message: PushMessage): Promise<PushOutcome>;
}

/**
 * Servicios de push de los navegadores: Chrome, Edge (nuevo), Opera y Samsung (Google), Firefox
 * (Mozilla), Safari (Apple) y Edge con WNS (Microsoft). La API solo manda pedidos a estos hosts:
 * si aceptara cualquier URL, un usuario podría usarla para hacer pedidos a direcciones internas.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}
