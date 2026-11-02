import { FAKE_SIGNATURE_HEADER, FakeIdentityProvider } from './fake-identity.provider';
import { createIdentityProvider } from './identity-provider.module';
import {
  InvalidWebhookSignatureError,
  WebhooksNotSupportedError,
} from './identity-verification.provider';
import { ManualIdentityProvider } from './manual-identity.provider';

const SECRET = 'x'.repeat(40);

describe('identity providers', () => {
  it('manual: no crea sesión externa ni acepta webhooks', async () => {
    const provider = new ManualIdentityProvider();
    expect(await provider.createSession()).toEqual({
      providerReference: null,
      redirectUrl: null,
      clientToken: null,
    });
    await expect(provider.parseWebhook()).rejects.toBeInstanceOf(WebhooksNotSupportedError);
  });

  it('fake: acepta un webhook bien firmado y rechaza uno alterado', async () => {
    const provider = new FakeIdentityProvider(SECRET);
    const request = provider.buildSignedWebhook({ eventId: 'e1', providerReference: 'r1' });
    await expect(provider.parseWebhook(request)).resolves.toEqual({
      eventId: 'e1',
      providerReference: 'r1',
    });

    const tampered = {
      ...request,
      rawBody: Buffer.from('{"eventId":"e1","providerReference":"otro"}'),
    };
    await expect(provider.parseWebhook(tampered)).rejects.toBeInstanceOf(
      InvalidWebhookSignatureError,
    );
    await expect(
      provider.parseWebhook({ rawBody: request.rawBody, headers: {} }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
    await expect(
      provider.parseWebhook({
        rawBody: request.rawBody,
        headers: { [FAKE_SIGNATURE_HEADER]: 'zz' },
      }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it('fake: exige un secreto largo', () => {
    expect(() => new FakeIdentityProvider('corto')).toThrow();
  });

  it('factory: elige el adaptador según la configuración', () => {
    expect(
      createIdentityProvider({ provider: 'manual', maxAttempts: 3, fakeWebhookSecret: '' }).name,
    ).toBe('MANUAL');
    expect(
      createIdentityProvider({ provider: 'fake', maxAttempts: 3, fakeWebhookSecret: SECRET }).name,
    ).toBe('FAKE');
  });
});
