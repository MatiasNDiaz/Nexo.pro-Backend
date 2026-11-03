import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SubscriptionPlan } from '../src/subscriptions/entities/subscription-plan.entity';
import { Subscription } from '../src/subscriptions/entities/subscription.entity';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus, VerificationStatus } from '../src/users/user.enums';
import { Client, cordobaLocalityId, signInAdmin, signInProfessional } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { PDF_BYTES, PNG_BYTES, uploadAvatar, uploadFile } from './utils/uploads';

type PlanCode = 'BASIC' | 'MEDIUM' | 'PREMIUM';

interface Listed {
  client: Client;
  id: string;
  email: string;
  slug: string;
}

describe('Catálogo público (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;
  let localityId: string;
  /** Barrio aprobado exclusivo de este archivo: aísla los resultados de otros tests. */
  let neighborhood: { id: string; name: string };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = (await signInAdmin(app)).client;
    localityId = await cordobaLocalityId(new Client(app));
    // Lo crea un profesional al cargar sus zonas y el admin lo aprueba.
    const seed = await signInProfessional(app);
    const name = `catalogo ${randomUUID().slice(0, 8).replace(/\d/g, 'z')}`;
    const areas = await seed.client.put('/professionals/me/service-areas', {
      serviceAreas: [{ localityId, neighborhoodName: name }],
    });
    const id = areas.body.serviceAreas[0].neighborhoodId as string;
    await admin.post(`/admin/neighborhoods/${id}/approve`);
    neighborhood = { id, name: areas.body.serviceAreas[0].neighborhoodName as string };
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (query: string) =>
    new Client(app).get(`/catalog/professionals?neighborhoodId=${neighborhood.id}${query}`);

  async function setPlan(userId: string, code: PlanCode) {
    const plan = await dataSource.getRepository(SubscriptionPlan).findOneByOrFail({ code });
    await dataSource.getRepository(Subscription).update({ userId }, { planId: plan.id });
  }

  /** Profesional visible: activo, identidad aprobada, foto, descripción y zona en el barrio. */
  async function listed(plan: PlanCode = 'BASIC', extra: Record<string, unknown> = {}) {
    const pro = await signInProfessional(app);
    await uploadAvatar(pro.client);
    await dataSource
      .getRepository(User)
      .update(pro.id, { verificationStatus: VerificationStatus.APPROVED });
    await pro.client.put('/professionals/me/service-areas', {
      serviceAreas: [{ localityId, neighborhoodName: neighborhood.name }],
    });
    const profile = await pro.client.patch('/professionals/me', {
      bio: 'Trabajos garantizados',
      ...extra,
    });
    await setPlan(pro.id, plan);
    return { ...pro, slug: profile.body.slug as string } satisfies Listed;
  }

  const slugsOf = (body: unknown, mine: Listed[]) =>
    (body as { data: Array<{ slug: string }> }).data
      .map((item) => item.slug)
      .filter((slug) => mine.some((m) => m.slug === slug));

  it('solo muestra perfiles completos, verificados, activos y con prueba o plan vigente', async () => {
    const ok = await listed();
    const noBio = await signInProfessional(app);
    await uploadAvatar(noBio.client);
    await dataSource
      .getRepository(User)
      .update(noBio.id, { verificationStatus: VerificationStatus.APPROVED });
    await noBio.client.put('/professionals/me/service-areas', {
      serviceAreas: [{ localityId, neighborhoodName: neighborhood.name }],
    });
    const expired = await listed();
    await dataSource
      .getRepository(Subscription)
      .update({ userId: expired.id }, { trialEndsAt: new Date(Date.now() - 1000) });
    const suspended = await listed();
    await dataSource.getRepository(User).update(suspended.id, { status: AccountStatus.SUSPENDED });
    const unverified = await listed();
    await dataSource
      .getRepository(User)
      .update(unverified.id, { verificationStatus: VerificationStatus.PENDING });

    const res = await search('&limit=50');
    expect(res.status).toBe(200);
    const slugs = (res.body.data as Array<{ slug: string }>).map((item) => item.slug);
    expect(slugs).toContain(ok.slug);
    for (const hidden of [expired, suspended, unverified]) {
      expect(slugs).not.toContain(hidden.slug);
      expect((await new Client(app).get(`/catalog/professionals/${hidden.slug}`)).status).toBe(404);
    }
    const noBioSlug = (await noBio.client.get('/professionals/me')).body.slug as string;
    expect(slugs).not.toContain(noBioSlug);
  });

  it('ordena por plan, después disponibles y después perfiles más completos (ADR 0022)', async () => {
    const basicComplete = await listed('BASIC', {
      businessName: 'Completo SA',
      yearsExperience: 10,
      referenceRate: 1000,
      rateMode: 'PER_JOB',
    });
    const basicAvailable = await listed('BASIC');
    await basicAvailable.client.put('/professionals/me/attention-status', { status: 'AVAILABLE' });
    const basicPlain = await listed('BASIC');
    const medium = await listed('MEDIUM');
    const premium = await listed('PREMIUM');
    const mine = [basicComplete, basicAvailable, basicPlain, medium, premium];

    const res = await search('&limit=50');
    expect(slugsOf(res.body, mine)).toEqual([
      premium.slug,
      medium.slug,
      basicAvailable.slug,
      basicComplete.slug,
      basicPlain.slug,
    ]);
  });

  it('filtra por disponibles ahora (también con horario automático) y por profesión', async () => {
    const manual = await listed();
    await manual.client.put('/professionals/me/attention-status', { status: 'AVAILABLE' });
    const scheduled = await listed();
    await scheduled.client.put('/professionals/me/availability', {
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '23:59' })),
    });
    await scheduled.client.patch('/professionals/me', { autoStatusFromSchedule: true });
    const resting = await listed();
    const mine = [manual, scheduled, resting];

    const available = await search('&availableNow=true&limit=50');
    expect(slugsOf(available.body, mine).sort()).toEqual([manual.slug, scheduled.slug].sort());
    // El estado calculado en SQL coincide con el del detalle.
    const item = (available.body.data as Array<{ slug: string; attentionStatus: string }>).find(
      (i) => i.slug === scheduled.slug,
    );
    expect(item?.attentionStatus).toBe('AVAILABLE');
    expect(
      (await new Client(app).get(`/catalog/professionals/${scheduled.slug}`)).body.attentionStatus,
    ).toBe('AVAILABLE');

    const professions = (await new Client(app).get('/professions')).body as Array<{ id: string }>;
    const mineProfession = (await manual.client.get('/professionals/me')).body.professions[0].id;
    const other = professions.find((p) => p.id !== mineProfession);
    const filtered = await search(`&professionId=${other?.id}&limit=50`);
    expect(slugsOf(filtered.body, mine)).toEqual([]);
    const same = await search(`&professionId=${mineProfession as string}&limit=50`);
    expect(slugsOf(same.body, mine)).toHaveLength(3);
  });

  it('un barrio pendiente no filtra ni se muestra; toda la localidad sí aparece', async () => {
    const pro = await listed();
    await pro.client.put('/professionals/me/service-areas', {
      serviceAreas: [
        { localityId, neighborhoodName: neighborhood.name },
        {
          localityId,
          neighborhoodName: `pendiente ${randomUUID().slice(0, 6).replace(/\d/g, 'q')}`,
        },
      ],
    });
    const detail = await new Client(app).get(`/catalog/professionals/${pro.slug}`);
    expect(detail.body.serviceAreas).toEqual([
      expect.objectContaining({ neighborhoodId: neighborhood.id }),
    ]);
    const areas = (await pro.client.get('/professionals/me')).body.serviceAreas as Array<{
      neighborhoodId: string;
    }>;
    const pendingId = areas.find((a) => a.neighborhoodId !== neighborhood.id)?.neighborhoodId;
    const bad = await new Client(app).get(`/catalog/professionals?neighborhoodId=${pendingId}`);
    expect(bad.status).toBe(400);

    const wholeLocality = await listed();
    await wholeLocality.client.put('/professionals/me/service-areas', {
      serviceAreas: [{ localityId }],
    });
    expect(slugsOf((await search('&limit=50')).body, [wholeLocality])).toEqual([
      wholeLocality.slug,
    ]);
  });

  it('detalle público: contacto, contenido según el plan, certificados no verificados y nombre aprobado', async () => {
    const pro = await listed('PREMIUM');
    await pro.client.put('/professionals/me/theme', { color: 'verde', animation: 'zoom' });
    for (let i = 0; i < 2; i++) {
      await pro.client.post('/professionals/me/media', {
        fileId: await uploadFile(pro.client, PNG_BYTES, {
          purpose: 'PROFILE_MEDIA',
          kind: 'IMAGE',
        }),
        purpose: 'PRESENTATION',
      });
    }
    const cert = await pro.client.post('/professionals/me/certifications', {
      fileId: await uploadFile(pro.client, PDF_BYTES, {
        purpose: 'CERTIFICATE',
        kind: 'DOCUMENT',
        filename: 'c.pdf',
        contentType: 'application/pdf',
      }),
      title: 'Matrícula',
      sensitiveDataConfirmed: true,
    });
    await pro.client.patch('/users/me', { firstName: 'Nombre Nuevo' });

    const res = await new Client(app).get(`/catalog/professionals/${pro.slug}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Juan',
      email: pro.email,
      identityVerified: true,
      theme: { color: 'verde', animation: 'zoom' },
      certifications: [{ title: 'Matrícula', verified: false, kind: 'DOCUMENT' }],
    });
    expect(res.body.media).toHaveLength(2);
    expect(res.body.coverImageUrl).toBe(res.body.media[0].url);
    expect(res.body).not.toHaveProperty('pendingFirstName');

    // Al quedar en Basic: sin personalización y con el contenido dentro del límite.
    await setPlan(pro.id, 'BASIC');
    const basic = await new Client(app).get(`/catalog/professionals/${pro.slug}`);
    expect(basic.body.theme).toEqual({});

    await admin.post(`/admin/professionals/certifications/${cert.body.id as string}/hide`, {
      reason: 'Muestra datos sensibles',
    });
    expect(
      (await new Client(app).get(`/catalog/professionals/${pro.slug}`)).body.certifications,
    ).toEqual([]);
    expect((await new Client(app).get('/catalog/professionals/no-existe-xxxxx')).status).toBe(404);
  });

  it('valida los filtros', async () => {
    const client = new Client(app);
    expect((await client.get('/catalog/professionals?limit=500')).status).toBe(400);
    expect((await client.get('/catalog/professionals?availableNow=quizas')).status).toBe(400);
    expect((await client.get('/catalog/professionals?professionId=x')).status).toBe(400);
    expect((await client.get('/catalog/professionals?orden=raro')).status).toBe(400);
  });
});
