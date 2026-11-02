import { createIdentityProvider } from './identity-provider.module';
import { FAKE_SIGNATURE_HEADER, FakeIdentityProvider } from './fake-identity.provider';
import { InvalidWebhookSignatureError, WebhooksNotSupportedError } from './identity-verification.provider';
import { ManualIdentityProvider } from './manual-identity.provider';

const SECRET = 'x'.repeat(40);

describe('identity providers', () => {
  it('manual: no crea sesión externa ni acepta webhooks', async () => {
    const p = new ManualIdentityProvider();
    expect(await p.createSession()).toEqual({ providerReference: null, redirectUrl: null, clientToken: null });
    await expect(p.parseWebhook()).rejects.toBeInstanceOf(WebhooksNotSupportedError);
  });

  it('fake: acepta un webhook bien firmado y rechaza uno alterado', async () => {
    const p = new FakeIdentityProvider(SECRET);
    const req = p.buildSignedWebhook({ eventId: 'e1', providerReference: 'r1' });
    await expect(p.parseWebhook(req)).resolves.toEqual({ eventId: 'e1', providerReference: 'r1' });

    const tampered = { ...req, rawBody: Buffer.from('{"eventId":"e1","providerReference":"otro"}') };
    await expect(p.parseWebhook(tampered)).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
    await expect(p.parseWebhook({ rawBody: req.rawBody, headers: {} })).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
    await expect(
      p.parseWebhook({ rawBody: req.rawBody, headers: { [FAKE_SIGNATURE_HEADER]: 'zz' } }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it('fake: exige un secreto largo', () => {
    expect(() => new FakeIdentityProvider('corto')).toThrow();
  });

  it('factory: fake prohibido en producción y manual por defecto', () => {
    expect(() => createIdentityProvider({ IDENTITY_PROVIDER: 'fake', NODE_ENV: 'production' })).toThrow(/producción/);
    expect(createIdentityProvider({}).name).toBe('MANUAL');
    expect(() => createIdentityProvider({ IDENTITY_PROVIDER: 'otro' })).toThrow();
  });
});
