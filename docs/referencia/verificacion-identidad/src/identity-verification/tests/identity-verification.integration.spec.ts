/**
 * Integración contra PostgreSQL real + e2e HTTP del webhook y de las rutas.
 * Requiere TEST_DATABASE_URL (p. ej. postgres://postgres@localhost:5432/idv_test).
 * La tabla `users` es un stub mínimo con las columnas que usa el módulo; en el proyecto la crea la fase de auth.
 */
import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Global, Module } from '@nestjs/common';
import { AUDIT_LOGGER, AuditEntry, AuditLogger } from '../../common/audit/audit-logger';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY, UserRole } from '../../common/decorators';
import { CreateIdentityVerification1730559600000 } from '../../database/migrations/1730559600000-CreateIdentityVerification';
import { FakeIdentityProvider } from '../../integrations/identity/fake-identity.provider';
import { IDENTITY_PROVIDER } from '../../integrations/identity/identity-verification.provider';
import { IdentityProviderEvent } from '../entities/identity-provider-event.entity';
import { IdentityVerification } from '../entities/identity-verification.entity';
import { IDENTITY_DECIDED_EVENT, IdentityVerificationService } from '../identity-verification.service';
import { IdentityVerificationModule } from '../identity-verification.module';
import { VerificationStatus } from '../verification-status.enum';

const DB_URL = process.env.TEST_DATABASE_URL;
const SECRET = 's'.repeat(48);

class MemoryAudit implements AuditLogger {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry) {
    this.entries.push(entry);
  }
}
const audit = new MemoryAudit();

@Global()
@Module({ providers: [{ provide: AUDIT_LOGGER, useValue: audit }], exports: [AUDIT_LOGGER] })
class TestAuditModule {}

/** Guard SOLO de test: simula al JwtCookieAuthGuard leyendo el usuario desde la base por header. */
@Injectable()
class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly ds: DataSource) {}
  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const id = req.headers['x-test-user'];
    if (!id) return false;
    const rows = await this.ds.query('SELECT id, role, status FROM users WHERE id = $1', [id]);
    if (!rows[0]) return false;
    req.user = { id: rows[0].id, sid: 'test', role: rows[0].role, status: rows[0].status } satisfies AuthUser;
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    return !roles || roles.includes(rows[0].role);
  }
}

const describeDb = DB_URL ? describe : describe.skip;

describeDb('IdentityVerification (PostgreSQL + HTTP)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let service: IdentityVerificationService;
  let fake: FakeIdentityProvider;
  let emitted: Array<{ userId: string; status: string }>;

  const createUser = async (role: UserRole, status = 'PENDING_VERIFICATION'): Promise<AuthUser> => {
    const id = randomUUID();
    await ds.query(`INSERT INTO users (id, role, status) VALUES ($1, $2, $3)`, [id, role, status]);
    return { id, sid: 'test', role, status: status as AuthUser['status'] };
  };
  const userRow = async (id: string) => (await ds.query('SELECT status, verification_status FROM users WHERE id=$1', [id]))[0];

  beforeAll(async () => {
    const setup = new DataSource({ type: 'postgres', url: DB_URL });
    await setup.initialize();
    await setup.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await setup.query(`CREATE TYPE verification_status AS ENUM ('NOT_STARTED','PENDING','REQUIRES_REVIEW','APPROVED','REJECTED','REVOKED')`);
    await setup.query(`CREATE TABLE users (
      id uuid PRIMARY KEY, role varchar(20) NOT NULL, status varchar(30) NOT NULL,
      verification_status verification_status NOT NULL DEFAULT 'NOT_STARTED',
      deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`);
    const qr = setup.createQueryRunner();
    await new CreateIdentityVerification1730559600000().up(qr);
    await qr.release();
    await setup.destroy();

    fake = new FakeIdentityProvider(SECRET);
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: DB_URL,
          entities: [IdentityVerification, IdentityProviderEvent],
          synchronize: false,
        }),
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
        TestAuditModule,
        IdentityVerificationModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }],
    })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(fake)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    ds = app.get(DataSource);
    service = app.get(IdentityVerificationService);
    emitted = [];
    app.get(EventEmitter2).on(IDENTITY_DECIDED_EVENT, (e: { userId: string; status: string }) => emitted.push(e));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('cliente inicia: queda PENDING, se replica en users y es idempotente', async () => {
    const u = await createUser('CUSTOMER');
    const first = await service.start(u);
    expect(first.status).toBe('PENDING');
    expect(first.alreadyInProgress).toBe(false);
    expect(first.redirectUrl).toContain('fake-identity.local');
    expect((await userRow(u.id)).verification_status).toBe('PENDING');

    const again = await service.start(u);
    expect(again.alreadyInProgress).toBe(true);
    expect(again.id).toBe(first.id);
  });

  it('dos inicios simultáneos crean un solo intento', async () => {
    const u = await createUser('PROFESSIONAL');
    const [a, b] = await Promise.all([service.start(u), service.start(u)]);
    expect(a.id).toBe(b.id);
    const count = await ds.getRepository(IdentityVerification).count({ where: { userId: u.id } });
    expect(count).toBe(1);
  });

  it('el admin no puede iniciar una verificación para sí mismo', async () => {
    const admin = await createUser('ADMIN', 'ACTIVE');
    await expect(service.start(admin)).rejects.toMatchObject({ status: 403 });
  });

  it('webhook aprobado: consulta al proveedor, aprueba y activa la cuenta', async () => {
    const u = await createUser('PROFESSIONAL');
    const started = await service.start(u);
    const v = await ds.getRepository(IdentityVerification).findOneByOrFail({ id: started.id! });
    fake.simulateDecision(v.providerReference!, 'APPROVED');

    const outcome = await service.handleWebhook(
      fake.buildSignedWebhook({ eventId: randomUUID(), providerReference: v.providerReference! }),
    );
    expect(outcome).toBe('PROCESSED');
    expect(await userRow(u.id)).toEqual({ status: 'ACTIVE', verification_status: 'APPROVED' });
    expect(emitted).toContainEqual(expect.objectContaining({ userId: u.id, status: 'APPROVED' }));
  });

  it('webhook duplicado se procesa una sola vez', async () => {
    const u = await createUser('CUSTOMER');
    const started = await service.start(u);
    const v = await ds.getRepository(IdentityVerification).findOneByOrFail({ id: started.id! });
    fake.simulateDecision(v.providerReference!, 'REJECTED', 'DOCUMENT_MISMATCH');
    const hook = fake.buildSignedWebhook({ eventId: 'dup-1', providerReference: v.providerReference! });

    expect(await service.handleWebhook(hook)).toBe('PROCESSED');
    expect(await service.handleWebhook(hook)).toBe('DUPLICATE');
    const events = await ds.getRepository(IdentityProviderEvent).count({ where: { eventId: 'dup-1' } });
    expect(events).toBe(1);
    const mine = await service.getMine(u.id);
    expect(mine).toMatchObject({ status: 'REJECTED', reasonCode: 'DOCUMENT_MISMATCH' });
  });

  it('el cuerpo del webhook no decide: si el proveedor dice PENDING no cambia nada', async () => {
    const u = await createUser('CUSTOMER');
    const started = await service.start(u);
    const v = await ds.getRepository(IdentityVerification).findOneByOrFail({ id: started.id! });
    const outcome = await service.handleWebhook(
      fake.buildSignedWebhook({ eventId: randomUUID(), providerReference: v.providerReference! }),
    );
    expect(outcome).toBe('IGNORED');
    expect((await userRow(u.id)).verification_status).toBe('PENDING');
  });

  it('REQUIRES_REVIEW lo resuelve el admin con motivo y auditoría; un webhook tardío no lo pisa', async () => {
    const u = await createUser('PROFESSIONAL');
    const admin = await createUser('ADMIN', 'ACTIVE');
    const started = await service.start(u);
    const v = await ds.getRepository(IdentityVerification).findOneByOrFail({ id: started.id! });
    fake.simulateDecision(v.providerReference!, 'REQUIRES_REVIEW');
    await service.handleWebhook(fake.buildSignedWebhook({ eventId: randomUUID(), providerReference: v.providerReference! }));
    expect((await userRow(u.id)).verification_status).toBe('REQUIRES_REVIEW');

    const decided = await service.adminDecide(admin, v.id, {
      decision: 'APPROVE',
      reason: 'DNI y rostro coinciden',
      adminNote: 'Revisado en el panel del proveedor',
    });
    expect(decided).toMatchObject({ status: 'APPROVED', decisionSource: 'ADMIN', decidedBy: admin.id });
    expect(audit.entries).toContainEqual(
      expect.objectContaining({ actorId: admin.id, action: 'IDENTITY_VERIFICATION_APPROVE', result: 'SUCCESS' }),
    );

    fake.simulateDecision(v.providerReference!, 'REJECTED');
    const late = await service.handleWebhook(
      fake.buildSignedWebhook({ eventId: randomUUID(), providerReference: v.providerReference! }),
    );
    expect(late).toBe('IGNORED');
    expect((await userRow(u.id)).verification_status).toBe('APPROVED');
  });

  it('revocar devuelve la cuenta a PENDING_VERIFICATION y transiciones inválidas dan 409 auditado', async () => {
    const u = await createUser('CUSTOMER');
    const admin = await createUser('ADMIN', 'ACTIVE');
    const started = await service.start(u);
    await service.adminDecide(admin, started.id!, { decision: 'APPROVE', reason: 'Videollamada ok' });
    await service.adminDecide(admin, started.id!, { decision: 'REVOKE', reason: 'Documento adulterado' });
    expect(await userRow(u.id)).toEqual({ status: 'PENDING_VERIFICATION', verification_status: 'REVOKED' });

    await expect(
      service.adminDecide(admin, started.id!, { decision: 'APPROVE', reason: 'Intento inválido' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(audit.entries).toContainEqual(expect.objectContaining({ result: 'DENIED', targetId: started.id }));
  });

  it('una cuenta suspendida no se reactiva al aprobar', async () => {
    const u = await createUser('CUSTOMER', 'SUSPENDED');
    const admin = await createUser('ADMIN', 'ACTIVE');
    const started = await service.start(u);
    await service.adminDecide(admin, started.id!, { decision: 'APPROVE', reason: 'Identidad confirmada' });
    expect(await userRow(u.id)).toEqual({ status: 'SUSPENDED', verification_status: 'APPROVED' });
  });

  it('límite de intentos y no reintentar si ya está aprobado', async () => {
    const u = await createUser('CUSTOMER');
    const admin = await createUser('ADMIN', 'ACTIVE');
    for (let i = 0; i < 3; i++) {
      const s = await service.start(u);
      await service.adminDecide(admin, s.id!, { decision: 'REJECT', reason: 'Foto ilegible' });
    }
    await expect(service.start(u)).rejects.toMatchObject({ status: 422 });

    const ok = await createUser('CUSTOMER');
    const s = await service.start(ok);
    await service.adminDecide(admin, s.id!, { decision: 'APPROVE', reason: 'Identidad confirmada' });
    await expect(service.start(ok)).rejects.toMatchObject({ status: 409 });
  });

  describe('HTTP', () => {
    it('webhook: firma inválida 401, válida 200, sin cambios con firma inválida', async () => {
      const u = await createUser('CUSTOMER');
      const started = await service.start(u);
      const v = await ds.getRepository(IdentityVerification).findOneByOrFail({ id: started.id! });
      fake.simulateDecision(v.providerReference!, 'APPROVED');
      const hook = fake.buildSignedWebhook({ eventId: randomUUID(), providerReference: v.providerReference! });

      await request(app.getHttpServer())
        .post('/api/v1/webhooks/identity')
        .set('content-type', 'application/json')
        .set('x-fake-identity-signature', '00'.repeat(32))
        .send(hook.rawBody.toString())
        .expect(401);
      expect((await userRow(u.id)).verification_status).toBe('PENDING');

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/identity')
        .set('content-type', 'application/json')
        .set(hook.headers as Record<string, string>)
        .send(hook.rawBody.toString())
        .expect(200);
      expect(res.body).toEqual({ received: true, outcome: 'PROCESSED' });
    });

    it('rutas de usuario y admin: roles, validación y DTO sin datos internos', async () => {
      const u = await createUser('PROFESSIONAL');
      const admin = await createUser('ADMIN', 'ACTIVE');
      const server = app.getHttpServer();

      await request(server).post('/api/v1/identity-verification').expect(403); // sin usuario
      const started = await request(server).post('/api/v1/identity-verification').set('x-test-user', u.id).expect(201);
      expect(started.body.manualReview).toBe(false);

      const me = await request(server).get('/api/v1/identity-verification/me').set('x-test-user', u.id).expect(200);
      expect(me.body.status).toBe('PENDING');
      expect(me.body).not.toHaveProperty('adminNote');
      expect(me.body).not.toHaveProperty('decidedBy');
      expect(me.body).not.toHaveProperty('userId');

      await request(server).get('/api/v1/admin/identity-verifications').set('x-test-user', u.id).expect(403);
      const list = await request(server)
        .get('/api/v1/admin/identity-verifications?status=PENDING&limit=5')
        .set('x-test-user', admin.id)
        .expect(200);
      expect(list.body.meta.limit).toBe(5);

      await request(server)
        .post(`/api/v1/admin/identity-verifications/${started.body.id}/decision`)
        .set('x-test-user', admin.id)
        .send({ decision: 'APPROVE' }) // falta el motivo
        .expect(400);
      await request(server)
        .post(`/api/v1/admin/identity-verifications/${started.body.id}/decision`)
        .set('x-test-user', admin.id)
        .send({ decision: 'APPROVE', reason: 'Identidad confirmada', role: 'ADMIN' }) // campo extra
        .expect(400);
      await request(server)
        .post(`/api/v1/admin/identity-verifications/${started.body.id}/decision`)
        .set('x-test-user', admin.id)
        .send({ decision: 'APPROVE', reason: 'Identidad confirmada' })
        .expect(200);
    });
  });
});
