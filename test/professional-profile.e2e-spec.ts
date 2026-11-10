import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { ProfessionalProfile } from '../src/professionals/entities/professional-profile.entity';
import { MAX_CERTIFICATIONS } from '../src/professionals/profile.service';
import { SubscriptionPlan } from '../src/subscriptions/entities/subscription-plan.entity';
import {
  Subscription,
  SubscriptionHistory,
  SubscriptionStatus,
} from '../src/subscriptions/entities/subscription.entity';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';
import { StoredFile } from '../src/uploads/entities/stored-file.entity';
import { FileStatus } from '../src/uploads/file.enums';
import { AccountsService } from '../src/users/accounts.service';
import { User } from '../src/users/entities/user.entity';
import {
  Client,
  cordobaLocalityId,
  mailbox,
  PASSWORD,
  professionId,
  signInAdmin,
  signInCustomer,
  signInProfessional,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { fakeMp4, PDF_BYTES, PNG_BYTES, uploadFile, uploadRaw } from './utils/uploads';

const image = (client: Client) =>
  uploadFile(client, PNG_BYTES, { purpose: 'PROFILE_MEDIA', kind: 'IMAGE' });
const video = (client: Client) =>
  uploadFile(client, fakeMp4(10_000), {
    purpose: 'PROFILE_MEDIA',
    kind: 'VIDEO',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
  });
const pdf = (client: Client) =>
  uploadFile(client, PDF_BYTES, {
    purpose: 'CERTIFICATE',
    kind: 'DOCUMENT',
    filename: 'titulo.pdf',
    contentType: 'application/pdf',
  });

describe('Perfil profesional, medios, certificados y prueba (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cambia el plan de la suscripción viva (en la etapa 9 lo hará el pago). */
  async function setPlan(userId: string, code: 'BASIC' | 'MEDIUM' | 'PREMIUM') {
    const plan = await dataSource.getRepository(SubscriptionPlan).findOneByOrFail({ code });
    await dataSource.getRepository(Subscription).update({ userId }, { planId: plan.id });
  }

  const subscriptionOf = (userId: string) =>
    dataSource.getRepository(Subscription).findOneByOrFail({ userId });

  describe('prueba de 30 días (ADR 0017)', () => {
    it('empieza al registrarse, con límites de Basic y contador', async () => {
      const { client } = await signInProfessional(app, 'PENDING_VERIFICATION' as never);
      const res = await client.get('/subscriptions/me');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'TRIAL',
        live: true,
        trialDaysLeft: 30,
        plan: { code: 'BASIC', maxImages: 5, maxVideos: 0, maxImageBytes: 5 * 1024 * 1024 },
      });
    });

    it('vencida: sin contenido nuevo, pero se puede editar el texto; la tarea la marca EXPIRED', async () => {
      const { client, id } = await signInProfessional(app);
      await dataSource
        .getRepository(Subscription)
        .update({ userId: id }, { trialEndsAt: new Date(Date.now() - 1000) });

      expect((await client.get('/subscriptions/me')).body).toMatchObject({ live: false });
      const upload = await client.post('/uploads', { purpose: 'PROFILE_MEDIA', kind: 'IMAGE' });
      expect(upload.status).toBe(403);
      expect(upload.body.code).toBe('SUBSCRIPTION_REQUIRED');
      expect((await client.patch('/professionals/me', { bio: 'Plomero matriculado' })).status).toBe(
        200,
      );

      expect(await app.get(SubscriptionsService).expireTrials()).toBeGreaterThanOrEqual(1);
      const subscription = await subscriptionOf(id);
      expect(subscription.status).toBe(SubscriptionStatus.EXPIRED);
      expect(
        await dataSource
          .getRepository(SubscriptionHistory)
          .countBy({ subscriptionId: subscription.id, event: 'TRIAL_EXPIRED' }),
      ).toBe(1);
    });

    it('recordatorios a los 7, 3 y 1 días, una sola vez cada uno', async () => {
      const { email, id } = await signInProfessional(app);
      const subscriptions = app.get(SubscriptionsService);
      const remindersTo = () =>
        mailbox(app).sent.filter((m) => m.to === email && m.subject.includes('de prueba'));

      await dataSource
        .getRepository(Subscription)
        .update({ userId: id }, { trialEndsAt: new Date(Date.now() + 2.5 * 24 * 3600 * 1000) });
      await subscriptions.sendTrialReminders();
      await subscriptions.sendTrialReminders();
      expect(remindersTo().map((m) => m.subject)).toEqual(['Te quedan 3 días de prueba']);

      await dataSource
        .getRepository(Subscription)
        .update({ userId: id }, { trialEndsAt: new Date(Date.now() + 6 * 3600 * 1000) });
      await subscriptions.sendTrialReminders();
      expect(remindersTo().map((m) => m.subject)).toEqual([
        'Te quedan 3 días de prueba',
        'Te quedan 1 día de prueba',
      ]);
    });

    it('un cliente que pasa a profesional recibe la prueba solo si nunca tuvo una', async () => {
      const { client: admin } = await signInAdmin(app);
      const customer = await signInCustomer(app);
      const localityId = await cordobaLocalityId(customer.client);
      const toProfessional = {
        role: 'PROFESSIONAL',
        reason: 'Pidió pasar a profesional por soporte',
        professionId: await professionId(customer.client),
        serviceAreas: [{ localityId }],
      };
      expect(
        (await admin.post(`/admin/users/${customer.id}/change-role`, toProfessional)).status,
      ).toBe(200);
      expect((await subscriptionOf(customer.id)).status).toBe(SubscriptionStatus.TRIAL);

      // Ida y vuelta: no recibe otra prueba.
      await dataSource
        .getRepository(Subscription)
        .update({ userId: customer.id }, { status: SubscriptionStatus.EXPIRED });
      await admin.post(`/admin/users/${customer.id}/change-role`, {
        role: 'CUSTOMER',
        reason: 'Vuelve a ser cliente por pedido propio',
      });
      await admin.post(`/admin/users/${customer.id}/change-role`, {
        role: 'PROFESSIONAL',
        reason: 'Vuelve a ser profesional por pedido propio',
      });
      expect(await dataSource.getRepository(Subscription).countBy({ userId: customer.id })).toBe(1);
    });
  });

  describe('datos del perfil', () => {
    it('muestra el perfil inicial con slug, profesión principal y zona', async () => {
      const { client } = await signInProfessional(app);
      const res = await client.get('/professionals/me');
      expect(res.status).toBe(200);
      expect(res.body.slug).toMatch(/^juan-gomez-[a-z0-9]{5}$/);
      expect(res.body.professions).toEqual([expect.objectContaining({ isPrimary: true })]);
      expect(res.body.serviceAreas).toEqual([
        expect.objectContaining({ neighborhoodId: null, localityName: 'Córdoba' }),
      ]);
      expect(res.body.attention).toMatchObject({ manual: 'RESTING', effective: 'RESTING' });
    });

    it('edita los datos con validación (descripción de 200, tarifa con modalidad)', async () => {
      const { client } = await signInProfessional(app);
      expect((await client.patch('/professionals/me', { bio: 'x'.repeat(201) })).status).toBe(400);
      const rate = await client.patch('/professionals/me', { referenceRate: 15000 });
      expect(rate.status).toBe(400);
      expect(rate.body.code).toBe('RATE_INCOMPLETE');

      const res = await client.patch('/professionals/me', {
        businessName: 'Plomería Juan',
        bio: 'Arreglos de agua y gas',
        yearsExperience: 12,
        worksWithTeam: true,
        referenceRate: 15000.5,
        rateMode: 'PER_VISIT',
        freeQuote: true,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        businessName: 'Plomería Juan',
        yearsExperience: 12,
        referenceRate: '15000.50',
        rateMode: 'PER_VISIT',
      });
      const cleared = await client.patch('/professionals/me', {
        referenceRate: null,
        rateMode: null,
      });
      expect(cleared.body).toMatchObject({ referenceRate: null, rateMode: null });
    });

    it('personalización según el plan', async () => {
      const { client, id } = await signInProfessional(app);
      const basic = await client.put('/professionals/me/theme', { color: 'azul' });
      expect(basic.status).toBe(403);
      expect(basic.body.code).toBe('THEME_NOT_IN_PLAN');

      await setPlan(id, 'MEDIUM');
      const medium = await client.put('/professionals/me/theme', {
        color: 'azul',
        gradient: { from: 'azul', to: 'violeta' },
        font: 'moderna',
        headline: 'Urgencias 24 h',
      });
      expect(medium.status).toBe(200);
      expect(medium.body.theme).toMatchObject({ color: 'azul', headline: 'Urgencias 24 h' });
      expect((await client.put('/professionals/me/theme', { animation: 'zoom' })).status).toBe(403);
      expect((await client.put('/professionals/me/theme', { color: '#ff0000' })).status).toBe(400);

      await setPlan(id, 'PREMIUM');
      expect((await client.put('/professionals/me/theme', { animation: 'zoom' })).status).toBe(200);
    });

    it('estilo por sección (ADR 0034): colores #rrggbb, campos según el plan', async () => {
      const { client, id } = await signInProfessional(app);
      const sobre = { background: '#123B7A', text: '#ffffff' };
      expect((await client.put('/professionals/me/theme', { sections: { sobre } })).status).toBe(
        403,
      );

      await setPlan(id, 'MEDIUM');
      const medium = await client.put('/professionals/me/theme', { sections: { sobre } });
      expect(medium.status).toBe(200);
      // Se guarda en minúsculas.
      expect(medium.body.theme.sections).toEqual({
        sobre: { background: '#123b7a', text: '#ffffff' },
      });
      const premiumOnly = await client.put('/professionals/me/theme', {
        sections: { sobre: { ...sobre, animation: 'rebote', size: 110 } },
      });
      expect(premiumOnly.status).toBe(403);
      const details = premiumOnly.body.details as Array<{ field: string }>;
      expect(details.map((d) => d.field)).toEqual([
        'sections.sobre.size',
        'sections.sobre.animation',
      ]);
      // Nada que no sea un color #rrggbb, ni secciones o campos inventados.
      for (const bad of [
        { sobre: { background: 'red' } },
        { sobre: { background: '#fff' } },
        { sobre: { text: '#12345g' } },
        { sobre: { background: '#123456;position:fixed' } },
        { cabecera: { background: '#123456' } },
        { sobre: { css: 'color:red' } },
      ]) {
        expect((await client.put('/professionals/me/theme', { sections: bad })).status).toBe(400);
      }

      await setPlan(id, 'PREMIUM');
      const full = {
        pagina: { background: '#f5f8fc' },
        contacto: {
          background: '#0b1f3a',
          backgroundTo: '#3b82f6',
          text: '#ffffff',
          size: 115,
          animation: 'girar',
        },
      };
      const premium = await client.put('/professionals/me/theme', {
        color: 'azul',
        sections: full,
      });
      expect(premium.status).toBe(200);
      expect(premium.body.theme).toEqual({ color: 'azul', sections: full });
      expect(
        (await client.put('/professionals/me/theme', { sections: { datos: { size: 130 } } }))
          .status,
      ).toBe(400);
      expect(
        (
          await client.put('/professionals/me/theme', {
            sections: { datos: { animation: 'explotar' } },
          })
        ).status,
      ).toBe(400);
    });

    it('profesiones según el plan, con una principal', async () => {
      const { client, id } = await signInProfessional(app);
      const professions = (await client.get('/professions')).body as Array<{ id: string }>;
      const two = {
        professionIds: [professions[0].id, professions[1].id],
        primaryId: professions[1].id,
      };
      const basic = await client.put('/professionals/me/professions', two);
      expect(basic.status).toBe(403);
      expect(basic.body.code).toBe('PLAN_LIMIT_REACHED');

      await setPlan(id, 'MEDIUM');
      const res = await client.put('/professionals/me/professions', two);
      expect(res.status).toBe(200);
      expect(res.body.professions).toHaveLength(2);
      expect(res.body.professions[0]).toMatchObject({ id: professions[1].id, isPrimary: true });
      expect(
        (
          await client.put('/professionals/me/professions', {
            professionIds: [professions[0].id],
            primaryId: professions[1].id,
          })
        ).status,
      ).toBe(400);
    });

    it('zonas de trabajo, redes sociales y horarios', async () => {
      const { client } = await signInProfessional(app);
      const localityId = await cordobaLocalityId(client);
      const areas = await client.put('/professionals/me/service-areas', {
        serviceAreas: [{ localityId, neighborhoodName: 'barrio del perfil e2e' }],
      });
      expect(areas.status).toBe(200);
      expect(areas.body.serviceAreas[0].neighborhoodName).toBe('Barrio del Perfil E2e');

      const badLink = await client.put('/professionals/me/social-links', {
        links: [{ network: 'INSTAGRAM', url: 'https://instagram.com.evil.io/juan' }],
      });
      expect(badLink.status).toBe(400);
      const links = await client.put('/professionals/me/social-links', {
        links: [
          { network: 'INSTAGRAM', url: 'https://instagram.com/plomeria.juan' },
          { network: 'WEBSITE', url: 'https://plomeriajuan.com.ar' },
        ],
      });
      expect(links.body.socialLinks).toHaveLength(2);

      const overlap = await client.put('/professionals/me/availability', {
        slots: [
          { weekday: 1, start: '08:00', end: '12:00' },
          { weekday: 1, start: '11:00', end: '14:00' },
        ],
      });
      expect(overlap.status).toBe(400);
      const allWeek = await client.put('/professionals/me/availability', {
        slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '23:59' })),
      });
      expect(allWeek.status).toBe(200);
      await client.patch('/professionals/me', { autoStatusFromSchedule: true });
      expect((await client.get('/professionals/me')).body.attention.effective).toBe('AVAILABLE');

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Cordoba',
      }).format(new Date());
      const dayOff = await client.post('/professionals/me/availability/exceptions', {
        startDate: today,
        endDate: today,
        type: 'DAY_OFF',
      });
      expect(dayOff.status).toBe(201);
      expect(dayOff.body.attention.effective).toBe('RESTING');
      const exceptionId = dayOff.body.availability.exceptions[0].id as string;
      expect(
        (await client.delete(`/professionals/me/availability/exceptions/${exceptionId}`)).status,
      ).toBe(204);
      expect(
        (
          await client.post('/professionals/me/availability/exceptions', {
            startDate: '2020-01-01',
            endDate: '2020-01-02',
            type: 'HOLIDAY',
          })
        ).status,
      ).toBe(400);
    });

    it('estado de atención manual con vencimiento de hasta 7 días', async () => {
      const { client } = await signInProfessional(app);
      const later = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await client.put('/professionals/me/attention-status', {
        status: 'AVAILABLE',
        until: later,
      });
      expect(res.body.attention).toMatchObject({ manual: 'AVAILABLE', effective: 'AVAILABLE' });
      const tooFar = new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString();
      expect(
        (
          await client.put('/professionals/me/attention-status', {
            status: 'WORKING',
            until: tooFar,
          })
        ).status,
      ).toBe(400);
    });

    it('un cliente no tiene perfil profesional ni sube medios', async () => {
      const { client } = await signInCustomer(app);
      expect((await client.get('/professionals/me')).status).toBe(403);
      const upload = await client.post('/uploads', { purpose: 'PROFILE_MEDIA', kind: 'IMAGE' });
      expect(upload.status).toBe(403);
      expect(upload.body.code).toBe('FILE_PURPOSE_NOT_ALLOWED');
      expect((await client.patch('/customers/me', { extraInfo: '  Timbre roto  ' })).body).toEqual({
        extraInfo: 'Timbre roto',
      });
      expect((await client.get('/customers/me')).body).toEqual({ extraInfo: 'Timbre roto' });
    });
  });

  describe('medios', () => {
    it('Basic: hasta 5 imágenes, sin videos ni banner; ordenar y borrar', async () => {
      const { client } = await signInProfessional(app);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await client.post('/professionals/me/media', {
          fileId: await image(client),
          purpose: i < 2 ? 'PRESENTATION' : 'WORK',
        });
        expect(res.status).toBe(201);
        expect(res.body.url).toContain('/api/v1/uploads/');
        ids.push(res.body.id as string);
      }
      const sixth = await client.post('/professionals/me/media', {
        fileId: await image(client),
        purpose: 'WORK',
      });
      expect(sixth.status).toBe(403);
      expect(sixth.body.code).toBe('PLAN_LIMIT_REACHED');

      const banner = await client.post('/professionals/me/media', {
        fileId: await image(client),
        purpose: 'BANNER',
      });
      expect(banner.status).toBe(403);
      const clip = await client.post('/professionals/me/media', {
        fileId: await video(client),
        purpose: 'CATALOG_VIDEO',
      });
      expect(clip.status).toBe(403);
      const wrong = await client.post('/professionals/me/media', {
        fileId: await image(client),
        purpose: 'CATALOG_VIDEO',
      });
      expect(wrong.body.code).toBe('INVALID_MEDIA_PURPOSE');

      const reordered = await client.put('/professionals/me/media/order', {
        ids: [...ids].reverse(),
      });
      expect(reordered.status).toBe(200);
      expect(
        (await client.put('/professionals/me/media/order', { ids: ids.slice(1) })).status,
      ).toBe(400);

      const fileId = (reordered.body.media as Array<{ id: string; fileId: string }>).find(
        (m) => m.id === ids[0],
      )?.fileId as string;
      expect((await client.delete(`/professionals/me/media/${ids[0]}`)).status).toBe(204);
      expect(
        (await dataSource.getRepository(StoredFile).findOneByOrFail({ id: fileId })).status,
      ).toBe(FileStatus.DELETED);
    });

    it('Premium: videos de 15 s y banner con video que reemplaza al anterior', async () => {
      const { client, id } = await signInProfessional(app);
      await setPlan(id, 'PREMIUM');
      expect(
        (
          await client.post('/professionals/me/media', {
            fileId: await video(client),
            purpose: 'CATALOG_VIDEO',
          })
        ).status,
      ).toBe(201);
      const first = await client.post('/professionals/me/media', {
        fileId: await image(client),
        purpose: 'BANNER',
      });
      const second = await client.post('/professionals/me/media', {
        fileId: await video(client),
        purpose: 'BANNER',
      });
      expect(second.status).toBe(201);
      const banners = (
        (await client.get('/professionals/me')).body.media as Array<{ purpose: string; id: string }>
      ).filter((m) => m.purpose === 'BANNER');
      expect(banners.map((m) => m.id)).toEqual([second.body.id]);
      expect(first.status).toBe(201);
    });

    it('un archivo de otro propósito o ya usado no se puede cargar', async () => {
      const { client } = await signInProfessional(app);
      const avatarFile = await uploadFile(client, PNG_BYTES, { purpose: 'AVATAR', kind: 'IMAGE' });
      const wrong = await client.post('/professionals/me/media', {
        fileId: avatarFile,
        purpose: 'WORK',
      });
      expect(wrong.body.code).toBe('WRONG_FILE_PURPOSE');
      const fileId = await image(client);
      await client.post('/professionals/me/media', { fileId, purpose: 'WORK' });
      const again = await client.post('/professionals/me/media', { fileId, purpose: 'WORK' });
      expect(again.status).toBe(409);
      // Sin confirmar todavía.
      const { fileId: pending } = await uploadRaw(client, PNG_BYTES, {
        purpose: 'PROFILE_MEDIA',
        kind: 'IMAGE',
      });
      expect(
        (await client.post('/professionals/me/media', { fileId: pending, purpose: 'WORK' })).body
          .code,
      ).toBe('FILE_NOT_READY');
    });
  });

  describe('certificados (ADR 0020)', () => {
    it('se publican con la confirmación, en PDF o imagen, como "cargados por el profesional"', async () => {
      const { client } = await signInProfessional(app);
      const fileId = await pdf(client);
      const unconfirmed = await client.post('/professionals/me/certifications', {
        fileId,
        title: 'Gasista matriculado',
      });
      expect(unconfirmed.status).toBe(400);

      const res = await client.post('/professionals/me/certifications', {
        fileId,
        title: 'Gasista matriculado',
        institution: 'ENARGAS',
        issuedYear: 2015,
        sensitiveDataConfirmed: true,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'DOCUMENT', status: 'ACTIVE', verified: false });
      const served = await new Client(app).agent.get(res.body.url as string);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toBe('application/pdf');
    });

    it(`máximo ${MAX_CERTIFICATIONS} por profesional`, async () => {
      const { client } = await signInProfessional(app);
      for (let i = 0; i < MAX_CERTIFICATIONS; i++) {
        const res = await client.post('/professionals/me/certifications', {
          fileId: await uploadFile(client, PNG_BYTES, { purpose: 'CERTIFICATE', kind: 'IMAGE' }),
          title: `Curso ${i + 1}`,
          sensitiveDataConfirmed: true,
        });
        expect(res.status).toBe(201);
      }
      const extra = await client.post('/professionals/me/certifications', {
        fileId: await pdf(client),
        title: 'Uno de más',
        sensitiveDataConfirmed: true,
      });
      expect(extra.status).toBe(409);
      expect(extra.body.code).toBe('CERTIFICATION_LIMIT_REACHED');
    });

    it('el admin los oculta y restaura con motivo y auditoría; ocultos no se sirven', async () => {
      const { client } = await signInProfessional(app);
      const { client: admin } = await signInAdmin(app);
      const cert = await client.post('/professionals/me/certifications', {
        fileId: await pdf(client),
        title: 'Curso de electricidad',
        sensitiveDataConfirmed: true,
      });
      const id = cert.body.id as string;
      const url = cert.body.url as string;

      expect((await admin.post(`/admin/professionals/certifications/${id}/hide`, {})).status).toBe(
        400,
      );
      const hidden = await admin.post(`/admin/professionals/certifications/${id}/hide`, {
        reason: 'Muestra el número de DNI',
      });
      expect(hidden.status).toBe(204);
      const mine = (await client.get('/professionals/me')).body.certifications[0];
      expect(mine).toMatchObject({
        status: 'HIDDEN_BY_ADMIN',
        url: null,
        hiddenReason: 'Muestra el número de DNI',
      });
      // El admin ve el perfil completo, con lo oculto y su motivo (para poder restaurarlo).
      const proId = (await client.get('/auth/me')).body.id as string;
      const seen = await admin.get(`/admin/professionals/${proId}/profile`);
      expect(seen.status).toBe(200);
      expect(seen.body.certifications[0]).toMatchObject({
        id,
        status: 'HIDDEN_BY_ADMIN',
        hiddenReason: 'Muestra el número de DNI',
      });
      expect((await client.get(`/admin/professionals/${proId}/profile`)).status).toBe(403);
      const unknown = await admin.get(`/admin/professionals/${randomUUID()}/profile`);
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('PROFILE_NOT_FOUND');
      expect((await new Client(app).agent.get(url)).status).toBe(404);
      expect(
        await dataSource
          .getRepository(AdminAuditLog)
          .countBy({ targetId: id, action: 'PROFESSIONAL_CERTIFICATION_HIDDEN' }),
      ).toBe(1);

      expect(
        (
          await admin.post(`/admin/professionals/certifications/${id}/restore`, {
            reason: 'Ya lo tapó',
          })
        ).status,
      ).toBe(204);
      expect((await new Client(app).agent.get(url)).status).toBe(200);
      expect(
        (
          await client.post(`/admin/professionals/certifications/${id}/hide`, {
            reason: 'Escalada',
          })
        ).status,
      ).toBe(403);
    });
  });

  it('al anonimizar la cuenta se borra el contenido del perfil', async () => {
    const { client, id } = await signInProfessional(app);
    await client.patch('/professionals/me', { bio: 'Descripción personal' });
    await client.post('/professionals/me/media', { fileId: await image(client), purpose: 'WORK' });
    await client.delete('/users/me').send({ password: PASSWORD });
    await dataSource
      .getRepository(User)
      .update(id, { deletionScheduledFor: new Date(Date.now() - 1000) });
    await app.get(AccountsService).purgeExpiredDeletions();

    const profile = await dataSource
      .getRepository(ProfessionalProfile)
      .findOneByOrFail({ userId: id });
    expect(profile).toMatchObject({ bio: null, businessName: null });
    expect(profile.slug).toMatch(/^eliminado-/);
    expect(
      await dataSource.query('SELECT 1 FROM professional_media WHERE professional_id = $1', [
        profile.id,
      ]),
    ).toEqual([]);
  });
});
