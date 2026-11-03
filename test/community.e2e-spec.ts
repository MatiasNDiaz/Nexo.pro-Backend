import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { Notification, NotificationType } from '../src/notifications/entities/notification.entity';
import { ServiceContract } from '../src/requests/entities/requests.entities';
import { SubscriptionPlan } from '../src/subscriptions/entities/subscription-plan.entity';
import { Subscription } from '../src/subscriptions/entities/subscription.entity';
import { anonymizeAccount } from '../src/users/account-anonymizer';
import { Client, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional } from './utils/marketplace';
import { PNG_BYTES, uploadFile } from './utils/uploads';

const DAY = 24 * 60 * 60 * 1000;

/** ADR 0028: reseñas, opiniones de la plataforma, favoritos y foro. */
describe('Reputación y comunidad (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;
  let visitor: Client;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = (await signInAdmin(app)).client;
    visitor = new Client(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const notificationsOf = (userId: string, type: NotificationType) =>
    dataSource.getRepository(Notification).countBy({ userId, type });

  async function setPlan(userId: string, code: 'BASIC' | 'MEDIUM' | 'PREMIUM') {
    const plan = await dataSource.getRepository(SubscriptionPlan).findOneByOrFail({ code });
    await dataSource.getRepository(Subscription).update({ userId }, { planId: plan.id });
  }

  /** Contratación aceptada entre un profesional del catálogo y un cliente. */
  async function contract() {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const created = await customer.client.post('/requests', {
      professionalIds: [pro.id],
      professionId: pro.professionId,
      description: 'Pierde agua la canilla de la cocina',
      urgency: 'CAN_WAIT',
    });
    const target = (created.body as { targets: Array<{ id: string }> }).targets[0];
    await pro.client.post(`/requests/targets/${target.id}/quotes`, { amount: 9000 });
    const selected = await customer.client.post(`/requests/targets/${target.id}/select`, {});
    return { pro, customer, contractId: (selected.body as { id: string }).id };
  }

  async function completed() {
    const pair = await contract();
    expect((await pair.pro.client.post(`/contracts/${pair.contractId}/complete`)).status).toBe(200);
    return pair;
  }

  const slugOf = async (pro: Client) =>
    ((await pro.get('/professionals/me')).body as { slug: string }).slug;

  describe('reseñas (C-06)', () => {
    it('solo de una contratación terminada propia, una por contratación', async () => {
      const { pro, customer, contractId } = await contract();
      const early = await customer.client.post('/reviews', { contractId, rating: 5 });
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('CONTRACT_NOT_COMPLETED');

      await pro.client.post(`/contracts/${contractId}/complete`);
      const stranger = await signInCustomer(app);
      expect((await stranger.client.post('/reviews', { contractId, rating: 1 })).status).toBe(404);

      const res = await customer.client.post('/reviews', {
        contractId,
        rating: 4,
        comment: 'Muy prolijo y puntual',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        rating: 4,
        author: { displayName: 'Ana P.' },
        status: 'VISIBLE',
      });
      const again = await customer.client.post('/reviews', { contractId, rating: 5 });
      expect(again.body.code).toBe('REVIEW_EXISTS');
      expect(await notificationsOf(pro.id, NotificationType.REVIEW_RECEIVED)).toBe(1);

      const slug = await slugOf(pro.client);
      const page = await visitor.get(`/catalog/professionals/${slug}/reviews`);
      expect(page.body).toMatchObject({ average: 4, count: 1 });
      expect(page.body.data[0]).toMatchObject({ comment: 'Muy prolijo y puntual' });
      const catalog = await visitor.get(`/catalog/professionals/${slug}`);
      expect(catalog.body).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
    });

    it('nunca de una contratación cancelada', async () => {
      const { customer, contractId } = await contract();
      await customer.client.post(`/contracts/${contractId}/cancel`, {});
      const res = await customer.client.post('/reviews', { contractId, rating: 1 });
      expect(res.body.code).toBe('CONTRACT_NOT_COMPLETED');
    });

    it('editar dentro de los 30 días; después solo se puede borrar', async () => {
      const { pro, customer, contractId } = await completed();
      const { id } = (await customer.client.post('/reviews', { contractId, rating: 3 })).body as {
        id: string;
      };
      const edited = await customer.client.patch(`/reviews/${id}`, { rating: 5, comment: null });
      expect(edited.body).toMatchObject({ rating: 5, comment: null, edited: true });

      await dataSource
        .getRepository(ServiceContract)
        .update(contractId, { completedAt: new Date(Date.now() - 31 * DAY) });
      const late = await customer.client.patch(`/reviews/${id}`, { rating: 1 });
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('REVIEW_WINDOW_CLOSED');
      expect((await customer.client.delete(`/reviews/${id}`)).status).toBe(204);
      const page = await visitor.get(`/catalog/professionals/${await slugOf(pro.client)}/reviews`);
      expect(page.body).toMatchObject({ count: 0, average: null });
      // Fuera del plazo tampoco se puede volver a reseñar.
      expect((await customer.client.post('/reviews', { contractId, rating: 5 })).body.code).toBe(
        'REVIEW_WINDOW_CLOSED',
      );
    });

    it('el profesional responde en público y el admin oculta con motivo', async () => {
      const { pro, customer, contractId } = await completed();
      const { id } = (await customer.client.post('/reviews', { contractId, rating: 2 })).body as {
        id: string;
      };
      expect((await customer.client.put(`/reviews/${id}/reply`, { body: 'x' })).status).toBe(403);
      const reply = await pro.client.put(`/reviews/${id}/reply`, {
        body: 'Gracias, lo vamos a mejorar',
      });
      expect(reply.body.reply).toMatchObject({ body: 'Gracias, lo vamos a mejorar' });
      expect(await notificationsOf(customer.id, NotificationType.REVIEW_REPLIED)).toBe(1);

      const slug = await slugOf(pro.client);
      expect((await admin.post(`/admin/reviews/${id}/hide`, { reason: 'Insultos' })).status).toBe(
        204,
      );
      expect((await visitor.get(`/catalog/professionals/${slug}/reviews`)).body.count).toBe(0);
      const mine = (await customer.client.get('/reviews/mine')).body as Array<{ id: string }>;
      expect(mine.find((r) => r.id === id)).toMatchObject({
        status: 'HIDDEN_BY_ADMIN',
        hiddenReason: 'Insultos',
      });
      expect(
        await dataSource
          .getRepository(AdminAuditLog)
          .countBy({ action: 'REVIEW_HIDDEN', targetId: id }),
      ).toBe(1);
      await admin.post(`/admin/reviews/${id}/restore`, { reason: 'Revisado de nuevo' });
      expect((await visitor.get(`/catalog/professionals/${slug}/reviews`)).body.count).toBe(1);
    });
  });

  describe('opiniones sobre la plataforma', () => {
    it('no se publican hasta que el admin las publica; editar las despublica', async () => {
      const customer = await signInCustomer(app);
      const mine = await customer.client.put('/platform-reviews/me', {
        rating: 5,
        comment: 'Encontré plomero en una hora',
      });
      expect(mine.body).toMatchObject({ published: false });
      const isPublic = async () =>
        ((await visitor.get('/platform-reviews?limit=50')).body.data as Array<{ id: string }>).some(
          (r) => r.id === mine.body.id,
        );
      expect(await isPublic()).toBe(false);

      expect((await admin.post(`/admin/platform-reviews/${mine.body.id}/publish`)).status).toBe(
        204,
      );
      expect(await isPublic()).toBe(true);
      await customer.client.put('/platform-reviews/me', { rating: 4 });
      expect(await isPublic()).toBe(false);
    });
  });

  describe('favoritos y avisos de disponibilidad', () => {
    it('solo profesionales del catálogo; el aviso sale con Medium o Premium al ponerse Disponible', async () => {
      const pro = await listedProfessional(app);
      const customer = await signInCustomer(app);
      expect(
        (await customer.client.put(`/favorites/${pro.id}`, { availabilityAlerts: true })).status,
      ).toBe(204);
      expect((await pro.client.put(`/favorites/${customer.id}`, {})).status).toBe(403);
      const list = (await customer.client.get('/favorites')).body as Array<object>;
      expect(list).toEqual([
        expect.objectContaining({
          professionalId: pro.id,
          listed: true,
          availabilityAlerts: true,
          alertsAvailable: false,
        }),
      ]);

      const setStatus = (status: string) =>
        pro.client.put('/professionals/me/attention-status', { status });
      // Basic (prueba): sin avisos.
      await setStatus('AVAILABLE');
      expect(await notificationsOf(customer.id, NotificationType.PROFESSIONAL_AVAILABLE)).toBe(0);

      await setPlan(pro.id, 'MEDIUM');
      await setStatus('RESTING');
      await setStatus('AVAILABLE');
      expect(await notificationsOf(customer.id, NotificationType.PROFESSIONAL_AVAILABLE)).toBe(1);
      // Sin leer el anterior no se repite.
      await setStatus('RESTING');
      await setStatus('AVAILABLE');
      expect(await notificationsOf(customer.id, NotificationType.PROFESSIONAL_AVAILABLE)).toBe(1);

      const hidden = await signInCustomer(app);
      const other = await signInCustomer(app);
      expect((await other.client.put(`/favorites/${hidden.id}`, {})).status).toBe(404);
      expect((await customer.client.delete(`/favorites/${pro.id}`)).status).toBe(204);
    });
  });

  describe('foro', () => {
    const image = (client: Client) =>
      uploadFile(client, PNG_BYTES, { purpose: 'FORUM_MEDIA', kind: 'IMAGE' });

    async function post(client: Client, body: object = {}) {
      const res = await client.post('/forum/posts', {
        type: 'PROFESSIONAL_WANTED',
        body: 'Necesito un plomero para cambiar la canilla',
        ...body,
      });
      expect(res.status).toBe(201);
      return res.body as { id: string };
    }

    it('lectura pública; publicar con profesiones, zona y hasta 2 imágenes', async () => {
      const customer = await signInCustomer(app);
      const professions = (await visitor.get('/professions')).body as Array<{ id: string }>;
      const tooMany = await customer.client.post('/forum/posts', {
        type: 'QUESTION',
        body: '¿Por qué pierde agua la canilla?',
        mediaFileIds: [
          await image(customer.client),
          await image(customer.client),
          await image(customer.client),
        ],
      });
      expect(tooMany.body.code).toBe('FORUM_MEDIA_LIMIT');

      const created = await post(customer.client, {
        type: 'QUESTION',
        body: '¿Por qué pierde agua la canilla?',
        professionIds: [professions[0].id, professions[1].id],
        budgetEstimate: 20000,
        mediaFileIds: [await image(customer.client), await image(customer.client)],
      });
      const read = await visitor.get(`/forum/posts/${created.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        type: 'QUESTION',
        author: { firstName: 'Ana', lastName: 'Pérez', role: 'CUSTOMER' },
        budgetEstimate: '20000.00',
        resolved: false,
        replies: [],
      });
      expect(read.body.media).toHaveLength(2);
      expect(read.body.professions).toHaveLength(2);
      const list = await visitor.get(`/forum/posts?professionId=${professions[0].id}&limit=50`);
      expect((list.body.data as Array<{ id: string }>).some((p) => p.id === created.id)).toBe(true);
    });

    it('respuestas anidadas, presupuesto solo de profesionales y avisos', async () => {
      const author = await signInCustomer(app);
      const { id } = await post(author.client);
      const pro = await listedProfessional(app);
      const neighbor = await signInCustomer(app);

      const priced = await neighbor.client.post(`/forum/posts/${id}/replies`, {
        body: 'Yo lo haría por menos',
        proposedPrice: 5000,
      });
      expect(priced.body.code).toBe('PRICE_NOT_ALLOWED');
      const first = await pro.client.post(`/forum/posts/${id}/replies`, {
        body: 'Estoy disponible esta semana',
        proposedPrice: 15000,
      });
      expect(first.status).toBe(201);
      const nested = await neighbor.client.post(`/forum/posts/${id}/replies`, {
        body: '¿Trabajás en Alberdi?',
        parentReplyId: first.body.id,
      });
      expect(nested.body.parentReplyId).toBe(first.body.id);
      expect(await notificationsOf(author.id, NotificationType.FORUM_REPLY)).toBe(2);
      expect(await notificationsOf(pro.id, NotificationType.FORUM_REPLY)).toBe(1);

      // Sin plan, el profesional solo lee.
      await dataSource
        .getRepository(Subscription)
        .update({ userId: pro.id }, { trialEndsAt: new Date(Date.now() - 1000) });
      expect((await pro.client.post(`/forum/posts/${id}/replies`, { body: 'Hola' })).status).toBe(
        403,
      );
      expect((await pro.client.get(`/forum/posts/${id}`)).status).toBe(200);

      // Borrar una respuesta con respuestas deja su lugar vacío.
      await pro.client.delete(`/forum/replies/${first.body.id}`);
      const thread = (await visitor.get(`/forum/posts/${id}`)).body.replies as Array<object>;
      expect(thread).toEqual([
        expect.objectContaining({ id: first.body.id, removed: true, body: '', author: null }),
        expect.objectContaining({ id: nested.body.id, removed: false }),
      ]);
    });

    it('resuelta no admite respuestas; "me gusta" idempotente; borrar la oculta', async () => {
      const author = await signInCustomer(app);
      const { id } = await post(author.client);
      const fan = await signInCustomer(app);
      expect((await fan.client.put(`/forum/posts/${id}/like`)).status).toBe(204);
      await fan.client.put(`/forum/posts/${id}/like`);
      expect((await visitor.get(`/forum/posts/${id}`)).body.likeCount).toBe(1);
      expect((await fan.client.get(`/forum/posts/${id}/my-likes`)).body).toEqual({
        post: true,
        replyIds: [],
      });

      expect((await fan.client.post(`/forum/posts/${id}/resolve`)).status).toBe(404);
      expect((await author.client.post(`/forum/posts/${id}/resolve`)).body.resolved).toBe(true);
      const late = await fan.client.post(`/forum/posts/${id}/replies`, { body: '¿Sigue?' });
      expect(late.body.code).toBe('FORUM_POST_RESOLVED');
      expect((await visitor.get(`/forum/posts/${id}`)).status).toBe(200);

      expect((await fan.client.delete(`/forum/posts/${id}`)).status).toBe(404);
      expect((await author.client.delete(`/forum/posts/${id}`)).status).toBe(204);
      expect((await visitor.get(`/forum/posts/${id}`)).status).toBe(404);
    });

    it('el admin oculta y restaura con motivo y auditoría', async () => {
      const author = await signInCustomer(app);
      const { id } = await post(author.client);
      expect(
        (await admin.post(`/admin/forum/posts/${id}/hide`, { reason: 'Spam repetido' })).status,
      ).toBe(204);
      expect((await visitor.get(`/forum/posts/${id}`)).status).toBe(404);
      expect(
        (await author.client.patch(`/forum/posts/${id}`, { body: 'Editado otra vez' })).status,
      ).toBe(404);
      await admin.post(`/admin/forum/posts/${id}/restore`, { reason: 'Era una consulta real' });
      expect((await visitor.get(`/forum/posts/${id}`)).status).toBe(200);
      expect(
        await dataSource
          .getRepository(AdminAuditLog)
          .countBy({ action: 'FORUM_POST_HIDDEN', targetId: id }),
      ).toBe(1);
    });
  });

  it('baja de cuenta: el foro se borra y las reseñas quedan como "Usuario eliminado"', async () => {
    const { pro, customer, contractId } = await completed();
    await customer.client.post('/reviews', { contractId, rating: 5, comment: 'Excelente' });
    const { id: postId } = (
      await customer.client.post('/forum/posts', {
        type: 'QUESTION',
        body: 'Consulta que se va a borrar',
      })
    ).body as { id: string };

    await dataSource.transaction((manager) => anonymizeAccount(manager, customer.id));

    expect((await visitor.get(`/forum/posts/${postId}`)).status).toBe(404);
    const page = await visitor.get(`/catalog/professionals/${await slugOf(pro.client)}/reviews`);
    expect(page.body.data[0]).toMatchObject({
      comment: 'Excelente',
      author: { displayName: 'Usuario eliminado' },
    });
    const [row] = await dataSource.query<Array<{ body: string }>>(
      `SELECT body FROM forum_posts WHERE id = $1`,
      [postId],
    );
    expect(row.body).toBe('');
  });
});
