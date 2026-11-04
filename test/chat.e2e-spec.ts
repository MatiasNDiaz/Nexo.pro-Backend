import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { Message } from '../src/chat/entities/chat.entities';
import { Notification } from '../src/notifications/entities/notification.entity';
import { Subscription } from '../src/subscriptions/entities/subscription.entity';
import { anonymizeAccount } from '../src/users/account-anonymizer';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus } from '../src/users/user.enums';
import { Client, signInCustomer, signInProfessional } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional, openChat } from './utils/marketplace';
import { PNG_BYTES, uploadFile } from './utils/uploads';

/** ADR 0024: chat cliente-profesional. */
describe('Chat (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (client: Client, conversationId: string, body: object) =>
    client.post(`/chat/conversations/${conversationId}/messages`, body);

  async function pair() {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const conversationId = await openChat(customer.client, pro.id);
    return { pro, customer, conversationId };
  }

  describe('quién puede abrir un chat', () => {
    it('el cliente abre uno por pareja y solo con profesionales del catálogo', async () => {
      const pro = await listedProfessional(app);
      const customer = await signInCustomer(app);
      const first = await openChat(customer.client, pro.id);
      expect(await openChat(customer.client, pro.id)).toBe(first);

      const hidden = await signInProfessional(app);
      const res = await customer.client.post('/chat/conversations', { professionalId: hidden.id });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PROFESSIONAL_NOT_AVAILABLE');
    });

    it('el profesional no inicia chats y un cliente sin verificar tampoco', async () => {
      const pro = await listedProfessional(app);
      const other = await listedProfessional(app);
      expect(
        (await pro.client.post('/chat/conversations', { professionalId: other.id })).status,
      ).toBe(403);
      const pending = await signInCustomer(app, AccountStatus.PENDING_VERIFICATION);
      expect(
        (await pending.client.post('/chat/conversations', { professionalId: pro.id })).status,
      ).toBe(403);
    });
  });

  describe('mensajes', () => {
    it('lectura, contador de no leídos y lo que ve el profesional del cliente (C-13)', async () => {
      const { pro, customer, conversationId } = await pair();
      await customer.client.patch('/customers/me', { extraInfo: 'Tocar timbre 2B' });
      expect(
        (await send(customer.client, conversationId, { body: 'Hola, ¿podés venir?' })).status,
      ).toBe(201);

      const list = await pro.client.get('/chat/conversations');
      const conversation = (list.body as Array<{ id: string }>).find(
        (c) => c.id === conversationId,
      );
      expect(conversation).toMatchObject({
        myRole: 'PROFESSIONAL',
        unread: 1,
        counterpart: {
          firstName: 'Ana',
          neighborhoodName: 'Nueva Córdoba',
          extraInfo: 'Tocar timbre 2B',
        },
        lastMessage: { body: 'Hola, ¿podés venir?', senderType: 'CUSTOMER' },
      });

      expect((await pro.client.post(`/chat/conversations/${conversationId}/read`)).status).toBe(
        204,
      );
      expect((await pro.client.get(`/chat/conversations/${conversationId}`)).body.unread).toBe(0);
      const mine = await customer.client.get(`/chat/conversations/${conversationId}`);
      expect(mine.body.counterpartReadAt).not.toBeNull();
      expect(mine.body.counterpart).toMatchObject({ slug: expect.any(String) });
      expect(mine.body.counterpart).not.toHaveProperty('extraInfo');
    });

    it('editar solo 15 minutos, eliminar siempre, y la versión original queda guardada', async () => {
      const { pro, customer, conversationId } = await pair();
      const sent = await send(customer.client, conversationId, { body: 'Texto original' });
      const id = sent.body.id as string;

      const edited = await customer.client.patch(`/chat/messages/${id}`, {
        body: 'Texto corregido',
      });
      expect(edited.body).toMatchObject({ body: 'Texto corregido', edited: true });
      expect(edited.body).not.toHaveProperty('originalBody');
      expect((await pro.client.patch(`/chat/messages/${id}`, { body: 'Ajeno' })).status).toBe(404);

      await dataSource.query(
        `UPDATE messages SET created_at = now() - interval '16 minutes' WHERE id = $1`,
        [id],
      );
      const late = await customer.client.patch(`/chat/messages/${id}`, { body: 'Tarde' });
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('EDIT_WINDOW_EXPIRED');

      expect((await customer.client.delete(`/chat/messages/${id}`)).status).toBe(204);
      const messages = (await pro.client.get(`/chat/conversations/${conversationId}/messages`))
        .body;
      expect(messages[0]).toMatchObject({ id, body: '', deleted: true });
      const stored = await dataSource.getRepository(Message).findOneByOrFail({ id });
      expect(stored.originalBody).toBe('Texto original');
    });

    it('valida el contenido y no deja escribir en chats ajenos', async () => {
      const { customer, conversationId } = await pair();
      expect((await send(customer.client, conversationId, {})).body.code).toBe('EMPTY_MESSAGE');
      expect((await send(customer.client, conversationId, { body: 'x'.repeat(2001) })).status).toBe(
        400,
      );
      const stranger = await signInCustomer(app);
      expect((await send(stranger.client, conversationId, { body: 'hola' })).status).toBe(404);
      expect((await send(customer.client, randomUUID(), { body: 'hola' })).status).toBe(404);
    });

    it('una sola notificación de mensajes nuevos por chat hasta leerlo', async () => {
      const { pro, customer, conversationId } = await pair();
      await send(customer.client, conversationId, { body: 'uno' });
      await send(customer.client, conversationId, { body: 'dos' });
      const unread = () =>
        dataSource
          .getRepository(Notification)
          .count({ where: { userId: pro.id, targetId: conversationId, readAt: IsNull() } });
      expect(await unread()).toBe(1);
      expect(
        (await pro.client.get('/notifications/unread-count')).body.unread,
      ).toBeGreaterThanOrEqual(1);
      await pro.client.post(`/chat/conversations/${conversationId}/read`);
      const left = await pro.client.get('/notifications');
      expect(
        (left.body.data as Array<{ targetId: string; read: boolean }>).filter(
          (n) => n.targetId === conversationId && !n.read,
        ),
      ).toEqual([]);
    });
  });

  it('adjuntos privados: solo los ven los dos participantes', async () => {
    const { pro, customer, conversationId } = await pair();
    const fileId = await uploadFile(customer.client, PNG_BYTES, {
      purpose: 'CHAT_ATTACHMENT',
      kind: 'IMAGE',
    });
    const sent = await send(customer.client, conversationId, { attachmentIds: [fileId] });
    expect(sent.status).toBe(201);
    expect(sent.body.attachments).toEqual([{ fileId, kind: 'IMAGE', mimeType: 'image/png' }]);

    const seen = await pro.client.get(`/chat/attachments/${fileId}`);
    expect(seen.status).toBe(200);
    expect(seen.headers['content-type']).toBe('image/png');
    expect(seen.headers['cache-control']).toBe('private, no-store');

    const stranger = await signInCustomer(app);
    expect((await stranger.client.get(`/chat/attachments/${fileId}`)).status).toBe(404);
    expect((await new Client(app).get(`/uploads/${fileId}/content`)).status).toBe(404);
    // El mismo archivo no se adjunta dos veces.
    expect((await send(customer.client, conversationId, { attachmentIds: [fileId] })).status).toBe(
      409,
    );
  });

  describe('la otra parte dio de baja su cuenta (H-02)', () => {
    const find = (list: unknown, id: string) =>
      (list as Array<{ id: string }>).find((c) => c.id === id);

    it('cliente anonimizado: el profesional sigue viendo el chat, de solo lectura', async () => {
      const { pro, customer, conversationId } = await pair();
      await send(customer.client, conversationId, { body: 'Hola, ¿podés venir?' });
      await dataSource.transaction((manager) => anonymizeAccount(manager, customer.id));

      const list = await pro.client.get('/chat/conversations');
      expect(list.status).toBe(200);
      expect(find(list.body, conversationId)).toMatchObject({
        canWrite: false,
        counterpart: {
          firstName: 'Cuenta',
          lastName: 'eliminada',
          avatarUrl: null,
          deactivated: true,
          neighborhoodName: null,
          extraInfo: null,
        },
        lastMessage: { body: 'Hola, ¿podés venir?' },
      });
      expect((await pro.client.get(`/chat/conversations/${conversationId}`)).status).toBe(200);
      expect((await pro.client.get(`/chat/conversations/${conversationId}/messages`)).status).toBe(
        200,
      );
      const write = await send(pro.client, conversationId, { body: '¿Seguís ahí?' });
      expect(write.status).toBe(409);
      expect(write.body.code).toBe('CUSTOMER_UNAVAILABLE');
    });

    it('cliente en los 30 días de arrepentimiento: tampoco se le escribe', async () => {
      const { pro, customer, conversationId } = await pair();
      await dataSource
        .getRepository(User)
        .update(customer.id, { status: AccountStatus.DEACTIVATED });

      const conversation = await pro.client.get(`/chat/conversations/${conversationId}`);
      expect(conversation.body).toMatchObject({
        canWrite: false,
        counterpart: { firstName: 'Ana', deactivated: true },
      });
      expect((await send(pro.client, conversationId, { body: 'hola' })).body.code).toBe(
        'CUSTOMER_UNAVAILABLE',
      );
    });

    it('profesional anonimizado: el cliente ve el chat sin enlace al perfil y no escribe', async () => {
      const { pro, customer, conversationId } = await pair();
      await dataSource.transaction((manager) => anonymizeAccount(manager, pro.id));

      const list = await customer.client.get('/chat/conversations');
      expect(list.status).toBe(200);
      expect(find(list.body, conversationId)).toMatchObject({
        canWrite: false,
        counterpart: { firstName: 'Cuenta', deactivated: true, slug: null, businessName: null },
      });
      // Volver a abrirlo desde el perfil (o un enlace viejo) devuelve el mismo chat.
      const reopened = await customer.client.post('/chat/conversations', {
        professionalId: pro.id,
      });
      expect(reopened.status).toBeLessThan(300);
      expect(reopened.body.id).toBe(conversationId);
      const write = await send(customer.client, conversationId, { body: 'hola' });
      expect(write.status).toBe(409);
      expect(write.body.code).toBe('PROFESSIONAL_UNAVAILABLE');
    });

    it('con la otra parte activa, nada cambia', async () => {
      const { pro, customer, conversationId } = await pair();
      const mine = await customer.client.get(`/chat/conversations/${conversationId}`);
      expect(mine.body).toMatchObject({ canWrite: true, counterpart: { deactivated: false } });
      expect(mine.body.counterpart.slug).toEqual(expect.any(String));
      const theirs = await pro.client.get(`/chat/conversations/${conversationId}`);
      expect(theirs.body).toMatchObject({ canWrite: true, counterpart: { deactivated: false } });
    });
  });

  it('profesional sin prueba ni plan: no usa el chat; el cliente lee pero no escribe', async () => {
    const { pro, customer, conversationId } = await pair();
    await send(customer.client, conversationId, { body: 'antes de vencer' });
    await dataSource
      .getRepository(Subscription)
      .update({ userId: pro.id }, { trialEndsAt: new Date(Date.now() - 1000) });

    const blocked = await pro.client.get('/chat/conversations');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('SUBSCRIPTION_REQUIRED');

    const write = await send(customer.client, conversationId, { body: 'hola?' });
    expect(write.status).toBe(409);
    expect(write.body.code).toBe('PROFESSIONAL_UNAVAILABLE');
    const read = await customer.client.get(`/chat/conversations/${conversationId}/messages`);
    expect(read.status).toBe(200);
    expect((await customer.client.get(`/chat/conversations/${conversationId}`)).body.canWrite).toBe(
      false,
    );
  });
});
