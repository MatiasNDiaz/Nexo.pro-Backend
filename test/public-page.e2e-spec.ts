import type { NestExpressApplication } from '@nestjs/platform-express';
import { AccountStatus } from '../src/users/user.enums';
import { signInCustomer, signInProfessional } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional } from './utils/marketplace';

interface OwnPage {
  published: boolean;
  missing: string[];
  profile: { slug: string; identityVerified: boolean; avatarUrl: string | null };
}

/** Vista previa de la página propia (decisión del fundador del 2026-11-11). */
describe('Página pública propia (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin verificar ni completar: el dueño la ve con lo que falta y nadie más la ve', async () => {
    const pro = await signInProfessional(app, AccountStatus.PENDING_VERIFICATION);
    const res = await pro.client.get('/professionals/me/public-page');
    expect(res.status).toBe(200);
    const page = res.body as OwnPage;
    expect(page.published).toBe(false);
    expect(page.missing).toEqual([
      'ACCOUNT_NOT_ACTIVE',
      'IDENTITY_NOT_VERIFIED',
      'NO_AVATAR',
      'NO_BIO',
    ]);
    expect(page.profile).toMatchObject({ identityVerified: false, avatarUrl: null });
    expect(page.profile.slug).toEqual(expect.any(String));
    expect((await pro.client.get(`/catalog/professionals/${page.profile.slug}`)).status).toBe(404);
  });

  it('completa y vigente: publicada, igual que en el catálogo', async () => {
    const pro = await listedProfessional(app);
    const page = (await pro.client.get('/professionals/me/public-page')).body as OwnPage;
    expect(page).toMatchObject({ published: true, missing: [] });
    expect(page.profile.identityVerified).toBe(true);
    const visible = await pro.client.get(`/catalog/professionals/${page.profile.slug}`);
    expect(visible.status).toBe(200);
    expect((visible.body as { slug: string }).slug).toBe(page.profile.slug);
  });

  it('solo para profesionales', async () => {
    const customer = await signInCustomer(app);
    expect((await customer.client.get('/professionals/me/public-page')).status).toBe(403);
  });
});
