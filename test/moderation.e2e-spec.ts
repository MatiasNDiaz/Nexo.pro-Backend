import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { Sanction } from '../src/moderation/entities/moderation.entities';
import { SanctionsService } from '../src/moderation/sanctions.service';
import { Notification, NotificationType } from '../src/notifications/entities/notification.entity';
import { anonymizeAccount } from '../src/users/account-anonymizer';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus, VerificationStatus } from '../src/users/user.enums';
import { Client, mailbox, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional, openChat } from './utils/marketplace';
import { PNG_BYTES, uploadFile } from './utils/uploads';

/** ADR 0029: reportes, strikes, sanciones, apelaciones, soporte, novedades y panel. */
describe('Moderación, soporte y panel del admin (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = (await signInAdmin(app)).client;
    adminId = ((await admin.get('/auth/me')).body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const count = (userId: string, type: NotificationType) =>
    dataSource.getRepository(Notification).countBy({ userId, type });
  const audited = (action: string, targetId: string) =>
    dataSource.getRepository(AdminAuditLog).countBy({ action, targetId });
  const statusOf = async (id: string) =>
    (await dataSource.getRepository(User).findOneByOrFail({ id })).status;
  interface MyModeration {
    sanctions: Array<{ id: string; type: string; active: boolean }>;
    strikes: Array<{ id: string; weight: number; voided: boolean }>;
  }
  const moderationOf = async (client: Client) =>
    (await client.get('/moderation/me')).body as MyModeration;

  /** Cliente con la identidad aprobada: al levantar la sanción vuelve a ACTIVE (ADR 0007). */
  async function verifiedCustomer() {
    const customer = await signInCustomer(app);
    await dataSource
      .getRepository(User)
      .update(customer.id, { verificationStatus: VerificationStatus.APPROVED });
    return customer;
  }
  const evidence = (client: Client) =>
    uploadFile(client, PNG_BYTES, { purpose: 'EVIDENCE', kind: 'IMAGE' });

  /** Un cliente y un profesional con un chat y un mensaje del profesional. */
  async function chatPair() {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const conversationId = await openChat(customer.client, pro.id);
    const sent = await pro.client.post(`/chat/conversations/${conversationId}/messages`, {
      body: 'Mensaje ofensivo',
    });
    return { pro, customer, conversationId, messageId: (sent.body as { id: string }).id };
  }

  const report = (client: Client, body: object) =>
    client.post('/reports', {
      reason: 'DISRESPECT',
      description: 'Me faltó el respeto en el chat',
      ...body,
    });

  describe('reportes', () => {
    it('el denunciado se entera solo si es válido y nunca ve quién lo reportó', async () => {
      const { pro, customer, conversationId, messageId } = await chatPair();
      const fileId = await evidence(customer.client);
      const created = await report(customer.client, {
        targetType: 'MESSAGE',
        targetId: messageId,
        reason: 'HARASSMENT',
        evidenceFileIds: [fileId],
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: 'SUBMITTED', reason: 'HARASSMENT' });
      const again = await report(customer.client, { targetType: 'MESSAGE', targetId: messageId });
      expect(again.body.code).toBe('REPORT_ALREADY_OPEN');
      expect(await count(pro.id, NotificationType.REPORT_UPHELD)).toBe(0);

      // Fotos privadas: el autor y el admin sí, el denunciado no.
      expect((await customer.client.get(`/evidence/${fileId}`)).status).toBe(200);
      expect((await admin.get(`/evidence/${fileId}`)).status).toBe(200);
      expect((await pro.client.get(`/evidence/${fileId}`)).status).toBe(403);

      const id = (created.body as { id: string }).id;
      const detail = await admin.get(`/admin/reports/${id}`);
      expect(detail.body).toMatchObject({
        reporter: { id: customer.id },
        reportedUser: { id: pro.id },
        evidenceFileIds: [fileId],
        target: { body: 'Mensaje ofensivo' },
      });
      expect((await admin.post(`/admin/reports/${id}/review`)).body.status).toBe('UNDER_REVIEW');

      const chat = await admin.get(`/admin/reports/${id}/conversation`);
      expect(chat.body.conversationId).toBe(conversationId);
      expect(chat.body.messages).toEqual([
        expect.objectContaining({ id: messageId, reported: true }),
      ]);
      expect(await audited('ADMIN_CHAT_ACCESSED', id)).toBe(1);

      const resolved = await admin.post(`/admin/reports/${id}/resolve`, {
        valid: true,
        note: 'Insultos comprobados',
      });
      expect(resolved.body.status).toBe('VALID');
      expect(await count(customer.id, NotificationType.REPORT_RESOLVED)).toBe(1);
      const [upheld] = await dataSource
        .getRepository(Notification)
        .findBy({ userId: pro.id, type: NotificationType.REPORT_UPHELD });
      expect(JSON.stringify(upheld)).not.toContain(customer.id);
      expect(upheld.body).not.toContain('Ana');
    });

    it('rechazado no tiene consecuencias; el chat solo se ve desde un reporte de mensaje', async () => {
      const pro = await listedProfessional(app);
      const customer = await signInCustomer(app);
      const created = await report(customer.client, { targetType: 'PROFILE', targetId: pro.id });
      const id = (created.body as { id: string }).id;
      expect((await admin.get(`/admin/reports/${id}/conversation`)).body.code).toBe(
        'NOT_A_MESSAGE_REPORT',
      );
      await admin.post(`/admin/reports/${id}/resolve`, { valid: false, note: 'Sin pruebas' });
      expect(await count(pro.id, NotificationType.REPORT_UPHELD)).toBe(0);
      expect((await customer.client.get('/reports/mine')).body[0].status).toBe('REJECTED');
    });

    it('no se reporta lo propio, a un admin ni un chat ajeno', async () => {
      const { pro, customer, messageId } = await chatPair();
      const stranger = await signInCustomer(app);
      expect(
        (await report(stranger.client, { targetType: 'MESSAGE', targetId: messageId })).status,
      ).toBe(404);
      expect(
        (await report(pro.client, { targetType: 'MESSAGE', targetId: messageId })).status,
      ).toBe(404);
      expect(
        (await report(customer.client, { targetType: 'PROFILE', targetId: customer.id })).status,
      ).toBe(404);
      expect(
        (await report(customer.client, { targetType: 'PROFILE', targetId: adminId })).status,
      ).toBe(404);
    });

    it('señal de alerta con 3 reportes: solo avisa al admin, una vez', async () => {
      const pro = await listedProfessional(app);
      const before = await count(adminId, NotificationType.MODERATION_ALERT);
      for (let i = 0; i < 4; i++) {
        const customer = await signInCustomer(app);
        await report(customer.client, { targetType: 'PROFILE', targetId: pro.id, reason: 'SPAM' });
      }
      const alerts = await dataSource.getRepository(Notification).countBy({
        userId: adminId,
        type: NotificationType.MODERATION_ALERT,
        targetId: pro.id,
      });
      expect(alerts).toBe(1);
      expect(await count(adminId, NotificationType.MODERATION_ALERT)).toBeGreaterThan(before);
      expect(await statusOf(pro.id)).toBe(AccountStatus.ACTIVE);
    });
  });

  describe('strikes, sanciones y apelaciones', () => {
    it('strike y advertencia manuales, con aviso e historial', async () => {
      const customer = await signInCustomer(app);
      const strike = await admin.post(`/admin/users/${customer.id}/strikes`, {
        weight: 2,
        reason: 'Faltas de respeto reiteradas',
      });
      expect(strike.status).toBe(201);
      expect(
        (
          await admin.post(`/admin/users/${customer.id}/strikes`, {
            weight: 4,
            reason: 'x'.repeat(12),
          })
        ).status,
      ).toBe(400);
      await admin.post(`/admin/users/${customer.id}/sanctions`, {
        type: 'WARNING',
        reason: 'Advertencia por el lenguaje',
      });
      const mine = (await customer.client.get('/moderation/me')).body;
      expect(mine.strikes).toEqual([expect.objectContaining({ weight: 2, voided: false })]);
      expect(mine.sanctions).toEqual([expect.objectContaining({ type: 'WARNING', active: true })]);
      expect(await count(customer.id, NotificationType.MODERATION_ACTION)).toBe(2);
      expect(await statusOf(customer.id)).toBe(AccountStatus.ACTIVE);
    });

    it('se puede levantar la sanción de una cuenta ya anonimizada y queda auditado (H-13)', async () => {
      const customer = await signInCustomer(app);
      const warning = await admin.post(`/admin/users/${customer.id}/sanctions`, {
        type: 'WARNING',
        reason: 'Advertencia por el lenguaje',
      });
      await dataSource.transaction((manager) => anonymizeAccount(manager, customer.id));

      const lifted = await admin.post(`/admin/sanctions/${warning.body.id}/lift`, {
        reason: 'Ya no corresponde',
      });
      expect(lifted.status).toBe(200);
      expect(lifted.body).toMatchObject({ id: warning.body.id, active: false });
      expect(await audited('SANCTION_LIFTED', customer.id)).toBe(1);
      // La cuenta sigue dada de baja: levantar la sanción no la reactiva.
      const stored = await dataSource
        .getRepository(User)
        .findOneOrFail({ where: { id: customer.id }, withDeleted: true });
      expect(stored.status).toBe(AccountStatus.DEACTIVATED);
    });

    it('perfil oculto (C-29): la cuenta sigue y el perfil sale del catálogo', async () => {
      const pro = await listedProfessional(app);
      const slug = ((await pro.client.get('/professionals/me')).body as { slug: string }).slug;
      const visitor = new Client(app);
      const hidden = await admin.post(`/admin/users/${pro.id}/sanctions`, {
        type: 'PROFILE_HIDDEN',
        reason: 'Fotos que no son de sus trabajos',
      });
      expect((await visitor.get(`/catalog/professionals/${slug}`)).status).toBe(404);
      expect((await pro.client.get('/professionals/me')).status).toBe(200);
      await admin.post(`/admin/sanctions/${hidden.body.id}/lift`, { reason: 'Corrigió las fotos' });
      expect((await visitor.get(`/catalog/professionals/${slug}`)).status).toBe(200);
    });

    it('suspensión con fecha de fin: solo ve su sanción y apela; se levanta sola y se audita', async () => {
      const customer = await verifiedCustomer();
      const endsAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      const res = await admin.post(`/admin/users/${customer.id}/suspend`, {
        reason: 'Suspensión por reportes válidos',
        endsAt,
      });
      expect(res.body.status).toBe('SUSPENDED');

      const client = new Client(app);
      expect((await client.login(customer.email)).status).toBe(200);
      const mine = await moderationOf(client);
      expect(mine.sanctions[0]).toMatchObject({ type: 'SUSPENSION', active: true });
      expect((await client.get('/favorites')).status).toBe(403);

      const appeal = await client.post('/moderation/appeals', {
        sanctionId: mine.sanctions[0].id,
        body: 'No fui yo, me robaron la cuenta',
      });
      expect(appeal.status).toBe(201);
      expect(
        (
          await client.post('/moderation/appeals', {
            sanctionId: mine.sanctions[0].id,
            body: 'Insisto, no fui yo',
          })
        ).body.code,
      ).toBe('APPEAL_ALREADY_OPEN');

      // Llega la fecha de fin: la tarea la levanta.
      await dataSource.getRepository(Sanction).update(mine.sanctions[0].id, {
        startsAt: new Date(Date.now() - 2 * 3600 * 1000),
        endsAt: new Date(Date.now() - 1000),
      });
      expect(await app.get(SanctionsService).expireDue()).toBeGreaterThanOrEqual(1);
      expect(await statusOf(customer.id)).toBe(AccountStatus.ACTIVE);
      expect(await audited('SANCTION_EXPIRED', customer.id)).toBe(1);
    });

    it('apelación aceptada levanta el baneo; rechazada deja el strike', async () => {
      const customer = await verifiedCustomer();
      await admin.post(`/admin/users/${customer.id}/ban`, { reason: 'Fraude a un profesional' });
      const strike = await admin.post(`/admin/users/${customer.id}/strikes`, {
        weight: 3,
        reason: 'Fraude a un profesional',
      });
      const client = new Client(app);
      await client.login(customer.email);
      const { sanctions } = await moderationOf(client);
      const ban = sanctions.find((s) => s.type === 'BAN')!;
      const banAppeal = await client.post('/moderation/appeals', {
        sanctionId: ban.id,
        body: 'Fue un malentendido con el pago',
      });
      const strikeAppeal = await client.post('/moderation/appeals', {
        strikeId: strike.body.id,
        body: 'Fue un malentendido con el pago',
      });

      const accepted = await admin.post(`/admin/appeals/${banAppeal.body.id}/decide`, {
        decision: 'ACCEPTED',
        note: 'El profesional confirmó el pago',
      });
      expect(accepted.body.status).toBe('ACCEPTED');
      expect(await statusOf(customer.id)).toBe(AccountStatus.ACTIVE);
      await admin.post(`/admin/appeals/${strikeAppeal.body.id}/decide`, {
        decision: 'REJECTED',
        note: 'El strike se mantiene',
      });
      // El baneo revocó la sesión original: se usa la que inició estando baneado.
      const after = await moderationOf(client);
      expect(after.strikes[0]).toMatchObject({ voided: false });
      expect(after.sanctions.find((s) => s.type === 'BAN')?.active).toBe(false);
      expect(await count(customer.id, NotificationType.APPEAL_DECIDED)).toBe(2);
    });
  });

  describe('soporte y novedades', () => {
    it('consulta con foto, respuesta del admin en la app y por email', async () => {
      const customer = await signInCustomer(app);
      const ticket = await customer.client.post('/support/tickets', {
        category: 'BUG',
        body: 'No puedo subir la foto de perfil',
        fileId: await evidence(customer.client),
      });
      expect(ticket.status).toBe(201);
      const id = (ticket.body as { id: string }).id;
      const reply = await admin.post(`/admin/support/tickets/${id}/messages`, {
        body: 'Ya lo arreglamos, probá de nuevo',
      });
      expect(reply.body).toMatchObject({ status: 'ANSWERED', email: customer.email });
      expect(await count(customer.id, NotificationType.SUPPORT_REPLY)).toBe(1);
      expect(mailbox(app).lastTo(customer.email)?.subject).toBe('Respuesta de soporte de Nexo PRO');
      const mine = (await customer.client.get(`/support/tickets/${id}`)).body as {
        messages: Array<{ fromStaff: boolean }>;
      };
      expect(mine.messages.map((m) => m.fromStaff)).toEqual([false, true]);
    });

    it('formulario público: 3 por hora por IP', async () => {
      const visitor = new Client(app);
      const send = () =>
        visitor.post('/support/contact', {
          name: 'Verónica',
          email: 'vero@example.com',
          category: 'SUGGESTION',
          body: 'Me gustaría que haya más oficios',
        });
      for (let i = 0; i < 3; i++) expect((await send()).status).toBe(202);
      expect((await send()).status).toBe(429);
    });

    it('novedad por rol y mensaje individual', async () => {
      const pro = await listedProfessional(app);
      const customer = await signInCustomer(app);
      const published = await admin.post('/admin/announcements', {
        title: 'Nuevos planes',
        body: 'Desde diciembre hay novedades en los planes.',
        segment: { roles: ['PROFESSIONAL'] },
      });
      expect(published.status).toBe(201);
      expect(published.body.recipients).toBeGreaterThanOrEqual(1);
      expect(await count(pro.id, NotificationType.ANNOUNCEMENT)).toBe(1);
      expect(await count(customer.id, NotificationType.ANNOUNCEMENT)).toBe(0);
      expect((await pro.client.get(`/announcements/${published.body.id}`)).body.title).toBe(
        'Nuevos planes',
      );
      expect((await customer.client.get(`/announcements/${published.body.id}`)).status).toBe(404);

      expect(
        (
          await admin.post(`/admin/users/${customer.id}/message`, {
            title: 'Hola',
            body: 'Revisá tu email, te escribimos.',
          })
        ).status,
      ).toBe(204);
      expect(await count(customer.id, NotificationType.ADMIN_MESSAGE)).toBe(1);
    });
  });

  it('panel: cifras, búsqueda y ficha completa', async () => {
    const customer = await signInCustomer(app);
    await admin.post(`/admin/users/${customer.id}/strikes`, {
      weight: 1,
      reason: 'Llegó tarde varias veces',
    });
    const dashboard = (await admin.get('/admin/dashboard')).body;
    expect(dashboard.usersByRole.CUSTOMER).toBeGreaterThan(0);
    expect(typeof dashboard.openReports).toBe('number');

    const found = (await admin.get(`/admin/users?q=${encodeURIComponent(customer.email)}`)).body;
    expect(found.data).toEqual([expect.objectContaining({ id: customer.id })]);
    const detail = (await admin.get(`/admin/users/${customer.id}`)).body;
    expect(detail).toMatchObject({ email: customer.email, activeStrikeWeight: 1 });
    expect((await customer.client.get('/admin/dashboard')).status).toBe(403);
  });
});
