import { createHash } from 'node:crypto';
import { isPasswordBreached } from './breached-passwords';
import { CaptchaService, LOGIN_FAILURES_BEFORE_CAPTCHA } from './captcha.service';

const suffixOf = (password: string) =>
  createHash('sha1').update(password).digest('hex').toUpperCase().slice(5);

describe('isPasswordBreached (Have I Been Pwned, k-anonimato)', () => {
  it('solo manda los 5 primeros caracteres del hash y reconoce una filtrada', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response(`${suffixOf('123456')}:37359195\r\nAAAA:0\r\n`));
    expect(await isPasswordBreached('123456', fetchFn)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
    expect(url).not.toContain(suffixOf('123456'));
    expect(init.headers).toMatchObject({ 'Add-Padding': 'true' });
  });

  it('el relleno con conteo 0 no cuenta como filtración', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(`${suffixOf('otra-clave')}:0\n`));
    expect(await isPasswordBreached('otra-clave', fetchFn)).toBe(false);
  });

  it('si el servicio no responde, devuelve null (el llamador deja pasar)', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('timeout'));
    expect(await isPasswordBreached('x', fetchFn)).toBeNull();
  });
});

describe('CaptchaService (Turnstile)', () => {
  const service = (secret: string, success = true) => {
    const captcha = new CaptchaService({ passwordBreachCheck: false, turnstileSecret: secret });
    captcha.fetchFn = jest
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success }))));
    return captcha;
  };

  it('apagado sin clave: no pide nada', async () => {
    const captcha = service('');
    await expect(captcha.assert(undefined)).resolves.toBeUndefined();
    expect(captcha.fetchFn).not.toHaveBeenCalled();
  });

  it('activado: exige un token válido', async () => {
    await expect(service('s'.repeat(30)).assert(undefined)).rejects.toMatchObject({
      response: { code: 'CAPTCHA_REQUIRED' },
    });
    await expect(service('s'.repeat(30), false).assert('token')).rejects.toBeDefined();
    await expect(service('s'.repeat(30)).assert('token')).resolves.toBeUndefined();
  });

  it('en el login lo pide recién después de 3 fallos desde la misma IP', async () => {
    const captcha = service('s'.repeat(30));
    for (let i = 0; i < LOGIN_FAILURES_BEFORE_CAPTCHA - 1; i++) captcha.recordLoginFailure('ip-1');
    await expect(captcha.assertForLogin('ip-1', undefined)).resolves.toBeUndefined();
    captcha.recordLoginFailure('ip-1');
    await expect(captcha.assertForLogin('ip-1', undefined)).rejects.toBeDefined();
    // Otra IP no se ve afectada.
    await expect(captcha.assertForLogin('ip-2', undefined)).resolves.toBeUndefined();
  });
});
