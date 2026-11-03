import { isPushServiceEndpoint } from './push-provider';

describe('Endpoints de push permitidos (ADR 0032)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
    'https://web.push.apple.com/QGZ2b3Jk',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB',
  ])('acepta el servicio de push de un navegador: %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com',
    'https://localhost/x',
    'https://169.254.169.254/latest/meta-data',
    'https://api.railway.internal/x',
    'no es una url',
  ])('rechaza cualquier otra dirección: %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });
});
