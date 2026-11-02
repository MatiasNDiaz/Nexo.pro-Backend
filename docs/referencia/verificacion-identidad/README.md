# Módulo de verificación de identidad — Repara Ya / Nexo Pro

Verificación de identidad para **clientes y profesionales**, independiente del proveedor.
Sigue el plan (`docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`, §8.2.1, §12 y P-02).

## Qué hace

- El usuario (cliente o profesional) inicia la verificación: `POST /api/v1/identity-verification`.
  Si ya tiene un intento abierto, devuelve ese (idempotente, también ante dos clics simultáneos).
- Consulta su estado: `GET /api/v1/identity-verification/me` (sin notas internas ni datos del admin).
- El proveedor avisa el resultado por `POST /api/v1/webhooks/identity` (firma obligatoria, idempotente).
  El resultado **se consulta al proveedor**; el cuerpo del webhook no decide nada.
- El admin ve la cola y decide: `GET /api/v1/admin/identity-verifications?status=REQUIRES_REVIEW`
  y `POST /api/v1/admin/identity-verifications/:id/decision` con `APPROVE`, `REJECT` o `REVOKE`
  y **motivo obligatorio**. Cada decisión queda auditada (incluidos los intentos inválidos).
- Al aprobar, una cuenta `PENDING_VERIFICATION` pasa a `ACTIVE`. Al revocar, vuelve a
  `PENDING_VERIFICATION`. Las cuentas suspendidas o baneadas no se reactivan.
- Se emite el evento `identity.decided` después del commit (auth lo usará para revocar sesiones al revocar).
- Máximo de intentos configurable (`IDENTITY_MAX_ATTEMPTS`, 3 por defecto); luego, soporte.
- **No se guardan imágenes de DNI ni selfies**: solo estado, proveedor, referencia, motivo y fechas.

## Proveedores incluidos

| `IDENTITY_PROVIDER` | Uso |
|---|---|
| `manual` (por defecto) | Modo actual: vos verificás (p. ej. por videollamada) y decidís desde el panel. No hay webhooks |
| `fake` | Solo desarrollo y tests: simula un KYC real con webhooks firmados (HMAC-SHA256). Prohibido en producción |

## Cómo conectar el proveedor real (cuando lo elijas)

1. Crear `src/integrations/identity/<proveedor>-identity.provider.ts` implementando
   `IdentityVerificationProvider` (`createSession`, `parseWebhook`, `fetchDecision`), siguiendo la
   **documentación vigente del proveedor** (firma de webhooks, API de sesiones y de resultados).
2. Agregar el `case` en `createIdentityProvider` y sus variables de entorno (API key, secreto de webhook).
3. En el frontend: tras `POST /identity-verification`, abrir `redirectUrl` o inicializar el SDK con
   `clientToken`. Las fotos van directo al proveedor.
4. Configurar en el panel del proveedor la URL del webhook: `https://api.<dominio>/api/v1/webhooks/identity`.
5. Antes de activarlo: texto de consentimiento revisado por un abogado (datos biométricos = datos
   sensibles, Ley 25.326) y contrato de tratamiento de datos con el proveedor.

El servicio, la base de datos y los endpoints no cambian.

## Cómo integrarlo al repo

- Copiar `src/` respetando rutas. `src/common/decorators/index.ts` y `src/common/audit/audit-logger.ts`
  son contratos mínimos: si el repo ya tiene los suyos, usar esos.
- **Importante:** los decoradores `@Roles`, `@Public`, etc. solo marcan rutas. **No expongas estos
  endpoints hasta que estén los guards globales de la fase de autenticación**; sin ellos no hay protección.
- La migración depende de la tabla `users` (con `role`, `status`, `verification_status`, `deleted_at`).
- `main.ts` debe crear la app con `NestFactory.create(AppModule, { rawBody: true })` (para la firma del webhook).
- La app necesita `EventEmitterModule.forRoot()`, `ThrottlerModule` y un provider global de `AUDIT_LOGGER`.
- Dependencias: `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/event-emitter`, `@nestjs/throttler`,
  `class-validator`, `class-transformer` (probado con NestJS 10 y TypeORM 0.3; adaptar si el repo usa NestJS 11).

## Pruebas (ejecutadas)

18 tests en verde: unitarios (máquina de estados, adaptadores) e integración contra **PostgreSQL 16 real**
con la migración aplicada, más HTTP con Supertest. Cubren idempotencia, concurrencia, webhook
duplicado, firma inválida, webhook tardío que no pisa al admin, revocación, cuenta suspendida,
límite de intentos, roles, validación de DTOs y que la respuesta del usuario no filtre datos internos.

```
TEST_DATABASE_URL=postgres://usuario@localhost:5432/base_de_test npx jest --runInBand
```

La prueba de integración **borra el esquema `public`** de esa base: usar una base exclusiva de test.
