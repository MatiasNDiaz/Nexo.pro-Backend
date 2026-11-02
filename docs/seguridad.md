# 🛡️ Guía de Seguridad Full-Stack — NestJS + TypeORM + PostgreSQL + Frontend TypeScript

> **Objetivo:** blindar una aplicación web lo más posible, siguiendo el **orden real de construcción** de un proyecto: desde la planificación y la base de datos, pasando por el backend (autenticación, sesiones, cookies, roles, dashboards), hasta el frontend, el deploy y el mantenimiento.
>
> **Stack de referencia:** PostgreSQL · TypeORM · NestJS (TypeScript) · Frontend en TypeScript (Next.js/React) · Deploy: frontend en Vercel, backend y base de datos en Railway.
>
> ⚠️ Ningún sistema es 100% inhackeable. La meta es **defensa en profundidad**: muchas capas independientes, de forma que si una falla, las demás sigan protegiendo.

---

## 📑 Índice

0. [Principios que guían todo](#0-principios-que-guían-todo)
1. [Planificación: modelado de amenazas y datos](#1-planificación-modelado-de-amenazas-y-datos)
2. [Estructura del proyecto, secretos y variables de entorno](#2-estructura-del-proyecto-secretos-y-variables-de-entorno)
3. [Base de datos PostgreSQL](#3-base-de-datos-postgresql)
4. [TypeORM: entidades, migraciones y consultas seguras](#4-typeorm-entidades-migraciones-y-consultas-seguras)
5. [NestJS: configuración base segura (main.ts)](#5-nestjs-configuración-base-segura-maints)
6. [Validación de entrada y salida (DTOs y serialización)](#6-validación-de-entrada-y-salida-dtos-y-serialización)
7. [Registro de usuarios y contraseñas](#7-registro-de-usuarios-y-contraseñas)
8. [Login](#8-login)
9. [Tokens, sesiones y cookies](#9-tokens-sesiones-y-cookies)
10. [Refresh tokens con rotación](#10-refresh-tokens-con-rotación)
11. [Logout y revocación de sesiones](#11-logout-y-revocación-de-sesiones)
12. [Protección CSRF](#12-protección-csrf)
13. [Autorización: roles (RBAC) y propiedad de recursos](#13-autorización-roles-rbac-y-propiedad-de-recursos)
14. [Verificación de email y recuperación de contraseña](#14-verificación-de-email-y-recuperación-de-contraseña)
15. [Autenticación en dos pasos (MFA/2FA)](#15-autenticación-en-dos-pasos-mfa2fa)
16. [Rate limiting y protección contra fuerza bruta](#16-rate-limiting-y-protección-contra-fuerza-bruta)
17. [Subida de archivos](#17-subida-de-archivos)
18. [Dashboard de administración](#18-dashboard-de-administración)
19. [Frontend en TypeScript (Next.js/React)](#19-frontend-en-typescript-nextjsreact)
20. [Logs, auditoría y monitoreo](#20-logs-auditoría-y-monitoreo)
21. [Dependencias y cadena de suministro](#21-dependencias-y-cadena-de-suministro)
22. [Deploy: Vercel + Railway](#22-deploy-vercel--railway)
23. [Testing de seguridad](#23-testing-de-seguridad)
24. [Privacidad y cumplimiento legal](#24-privacidad-y-cumplimiento-legal)
25. [Respuesta ante incidentes](#25-respuesta-ante-incidentes)
26. [Usar Claude Code para reforzar la seguridad](#26-usar-claude-code-para-reforzar-la-seguridad)
27. [Checklist final antes de producción](#27-checklist-final-antes-de-producción)

---

## 0. Principios que guían todo

Antes de escribir una línea de código, internalizá estas reglas. Todo el resto del documento las aplica.

| Principio | Qué significa en la práctica |
|---|---|
| **Nunca confíes en el cliente** | Todo lo que llega del navegador (body, query, headers, cookies, archivos) puede estar manipulado. Ocultar un botón en el frontend **no es seguridad**. |
| **Defensa en profundidad** | Proteger en varias capas: frontend (UX) → API (guards) → servicio (reglas de negocio) → base de datos (permisos, RLS, constraints). |
| **Mínimo privilegio** | Cada usuario, rol, servicio y credencial de base de datos tiene solo los permisos estrictamente necesarios. |
| **Denegar por defecto** | Toda ruta es privada salvo que se marque explícitamente como pública. Todo rol no tiene permisos salvo que se le asignen. |
| **Fallar de forma segura** | Si algo falla (token inválido, error inesperado), el resultado es "acceso denegado", nunca "acceso permitido". |
| **Minimización de datos** | No guardes datos que no necesitás. No devuelvas campos que el cliente no necesita. |
| **Secretos fuera del código** | Ninguna contraseña, API key o secret en el repositorio. Nunca. |
| **Registrar y monitorear** | Si no lo registrás, no te enterás de que te atacaron. |

---

## 1. Planificación: modelado de amenazas y datos

**Paso 1.1 — Inventario de datos.** Hacé una tabla con cada dato que vas a guardar y clasificalo:

| Dato | Sensibilidad | ¿Lo necesito? | Protección |
|---|---|---|---|
| Email | Personal | Sí (login) | Acceso restringido, nunca público |
| Contraseña | Crítica | Solo su hash | Hash argon2id |
| DNI / teléfono / dirección | Personal sensible | Evaluar | Cifrado a nivel columna |
| Datos de pago | Crítica | **No** | Delegar en Mercado Pago / Stripe. Nunca guardes números de tarjeta |
| Logs de acceso | Interna | Sí | Retención limitada, sin secretos |

**Paso 1.2 — Definí roles y permisos desde el inicio.** Escribí una matriz:

| Acción | USER | EDITOR | ADMIN |
|---|---|---|---|
| Ver su propio perfil | ✅ | ✅ | ✅ |
| Editar contenido propio | ✅ | ✅ | ✅ |
| Editar contenido ajeno | ❌ | ✅ | ✅ |
| Ver lista de usuarios | ❌ | ❌ | ✅ |
| Cambiar roles | ❌ | ❌ | ✅ |

**Paso 1.3 — Modelado de amenazas (rápido).** Para cada funcionalidad preguntate:
- ¿Qué pasa si un usuario no logueado llama a este endpoint directamente?
- ¿Qué pasa si un USER cambia el ID en la URL por el de otro usuario? (**IDOR**)
- ¿Qué pasa si manda campos extra en el body, como `"role": "ADMIN"`? (**mass assignment**)
- ¿Qué pasa si lo llama 10.000 veces por minuto?
- ¿Qué pasa si el input contiene SQL, HTML o scripts?

Guardá estas respuestas: se convierten en tus tests de seguridad (sección 23).

---

## 2. Estructura del proyecto, secretos y variables de entorno

**Paso 2.1 — Estructura sugerida del backend (NestJS):**

```
src/
├── main.ts
├── app.module.ts
├── config/
│   └── env.validation.ts        # validación estricta de variables de entorno
├── common/
│   ├── decorators/              # @Public, @Roles, @CurrentUser
│   ├── guards/                  # AuthGuard, RolesGuard, OriginGuard
│   ├── filters/                 # filtro global de excepciones
│   └── crypto/                  # utilidades de cifrado
├── database/
│   ├── data-source.ts
│   └── migrations/
├── auth/                        # login, registro, refresh, logout
├── users/
├── sessions/
└── audit/                       # registro de auditoría
```

**Paso 2.2 — `.gitignore` desde el primer commit:**

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
```

Mantené un `.env.example` **sin valores reales** para documentar qué variables existen.

**Paso 2.3 — Validá las variables de entorno al arrancar.** Si falta un secret o es débil, la app no debe iniciar.

```ts
// src/config/env.validation.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(64, 'El secret debe tener al menos 64 caracteres'),
  COOKIE_DOMAIN: z.string().optional(),
  DATA_ENCRYPTION_KEY: z.string().length(64), // 32 bytes en hex para AES-256
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

```ts
// app.module.ts
ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
```

**Paso 2.4 — Generá secrets fuertes**, nunca inventados a mano:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Paso 2.5 — Reglas sobre secretos:**
- Un secret distinto por entorno (desarrollo, staging, producción).
- Guardalos solo en las variables de entorno de Railway/Vercel.
- Si un secret se filtró (por ejemplo, se subió a GitHub), **rotalo inmediatamente**. Borrar el commit no alcanza: ya está en el historial y en bots que escanean GitHub.
- Usá `gitleaks` o el secret scanning de GitHub para detectar filtraciones (sección 21).

---

## 3. Base de datos PostgreSQL

### 3.1 Usuarios de base de datos con mínimo privilegio

No uses el superusuario (`postgres`) para la aplicación. Creá dos roles:

- **`app_migrator`**: dueño del esquema; solo se usa para correr migraciones.
- **`app_user`**: el que usa la app en runtime; solo puede leer y escribir datos, **no** puede crear, alterar ni borrar tablas.

```sql
-- Ejecutar como superusuario
CREATE ROLE app_migrator LOGIN PASSWORD '<<generado>>';
CREATE ROLE app_user     LOGIN PASSWORD '<<generado>>';

CREATE SCHEMA app AUTHORIZATION app_migrator;

GRANT USAGE ON SCHEMA app TO app_user;

-- Permisos sobre tablas futuras creadas por el migrator
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Que nadie más pueda crear objetos en public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

> 💡 Si un atacante logra una inyección SQL, con `app_user` no puede hacer `DROP TABLE` ni leer tablas del sistema que no le corresponden. Algunos planes gestionados limitan la creación de roles; si tu proveedor no lo permite, al menos no expongas la base y usá credenciales distintas por entorno.

### 3.2 Conexión segura

- **Railway:** conectá el backend a la base por la **red privada** (la URL interna de Railway), no por el proxy público. Si no necesitás acceder desde afuera, no expongas la base a internet.
- Si te conectás por red pública, usá **SSL/TLS** obligatorio.
- Nunca abras el puerto 5432 a `0.0.0.0` en un servidor propio.
- Para conectarte vos desde tu PC con un cliente (DBeaver, pgAdmin), usá credenciales de solo lectura cuando sea posible.

### 3.3 Integridad de datos con constraints

La base de datos es tu última línea de defensa. Aunque el backend valide, **la base también debe hacerlo**:

```sql
CREATE TABLE app.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,           -- citext: único sin importar mayúsculas
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'USER'
                CHECK (role IN ('USER', 'EDITOR', 'ADMIN')),
  email_verified_at timestamptz,
  failed_login_attempts int NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
```

Reglas:
- **IDs `uuid`** en lugar de enteros autoincrementales para recursos expuestos: no se pueden adivinar ni enumerar (`/orders/1`, `/orders/2`...). Ojo: **no reemplaza** la verificación de permisos, solo dificulta la enumeración.
- `NOT NULL`, `UNIQUE`, `CHECK` y `FOREIGN KEY` siempre que tengan sentido.
- Emails con `citext` (extensión `CREATE EXTENSION citext;`) para evitar duplicados como `Juan@x.com` y `juan@x.com`.

### 3.4 Cifrado de datos sensibles a nivel de columna

Las contraseñas se **hashean** (sección 7). Los datos que necesitás leer después (DNI, teléfono, dirección) se **cifran**. Si alguien roba un backup, no puede leerlos sin la clave.

```ts
// src/common/crypto/field-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv.tag.datos (base64)
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv(ALGO, Buffer.from(keyHex, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
```

Con TypeORM podés aplicarlo automáticamente con un `transformer`:

```ts
const encryptedTransformer = {
  to: (value?: string | null) => (value ? encrypt(value, process.env.DATA_ENCRYPTION_KEY!) : value),
  from: (value?: string | null) => (value ? decrypt(value, process.env.DATA_ENCRYPTION_KEY!) : value),
};

@Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
phone?: string | null;
```

> ⚠️ Los campos cifrados así no se pueden buscar con `WHERE`. Si necesitás buscar por ellos (ej. DNI), guardá además un **hash HMAC** del valor en otra columna indexada.
> ⚠️ La clave de cifrado vive en variables de entorno, **nunca** en la base de datos.

### 3.5 Row Level Security (RLS) — opcional, capa extra

RLS hace que PostgreSQL mismo filtre las filas según el usuario actual. Aunque un bug en el backend olvide el `WHERE user_id = ...`, la base no devuelve datos ajenos.

```sql
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_owner ON app.orders
  USING (user_id = current_setting('app.current_user_id', true)::uuid);
```

En el backend, dentro de una transacción:

```ts
await dataSource.transaction(async (manager) => {
  await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
  return manager.find(Order); // Postgres solo devuelve las órdenes del usuario
});
```

> El `true` final de `set_config` hace que el valor dure solo esa transacción (importante con pool de conexiones). Recordá que el **dueño de la tabla ignora RLS** salvo que uses `FORCE`, y que los admins necesitan su propia política.

### 3.6 Backups

- Activá **backups automáticos** diarios (Railway los ofrece según el plan) y verificá la retención.
- **Probá restaurar** un backup al menos una vez. Un backup que nunca restauraste es una suposición, no un backup.
- Si exportás backups manualmente, cifralos y no los dejes en tu escritorio ni en Drive público.

---

## 4. TypeORM: entidades, migraciones y consultas seguras

### 4.1 Nunca `synchronize: true` en producción

```ts
// src/database/data-source.ts
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: 'app',
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,          // ❗ siempre false: usar migraciones
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  extra: { max: 10 },          // tamaño del pool
});
```

`synchronize: true` puede **borrar columnas con datos** si cambiás una entidad. Usá migraciones versionadas y revisalas antes de aplicarlas.

### 4.2 Entidad de usuario segura

```ts
// src/users/user.entity.ts
import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

export enum Role { USER = 'USER', EDITOR = 'EDITOR', ADMIN = 'ADMIN' }

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'citext', unique: true })
  email: string;

  @Exclude()                                   // nunca se serializa en respuestas
  @Column({ name: 'password_hash', select: false }) // no se trae en consultas por defecto
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Exclude()
  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Exclude()
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

Dos capas: `select: false` evita traer el hash de la base, y `@Exclude()` evita enviarlo aunque por error se haya traído. Cuando sí lo necesitás (login):

```ts
this.usersRepo
  .createQueryBuilder('u')
  .addSelect('u.passwordHash')
  .where('u.email = :email', { email })
  .getOne();
```

### 4.3 Prevención de inyección SQL

TypeORM parametriza automáticamente `find`, `findOne`, `save`, etc. El peligro está en **concatenar strings**:

```ts
// ❌ VULNERABLE: inyección SQL
qb.where(`user.email = '${email}'`);
dataSource.query(`SELECT * FROM users WHERE name = '${name}'`);

// ✅ SEGURO: parámetros
qb.where('user.email = :email', { email });
dataSource.query('SELECT * FROM users WHERE name = $1', [name]);
```

Cuidados extra:
- **`ORDER BY` dinámico:** los nombres de columna no se pueden parametrizar. Usá una lista blanca:

```ts
const SORTABLE = { createdAt: 'u.createdAt', email: 'u.email' } as const;
const column = SORTABLE[dto.sortBy as keyof typeof SORTABLE] ?? 'u.createdAt';
qb.orderBy(column, dto.order === 'ASC' ? 'ASC' : 'DESC');
```

- **`LIKE`:** escapá `%` y `_` del input del usuario si no querés que los use como comodines.
- **Paginación con límite máximo:** nunca permitas `take=1000000` (te tumban la base).

```ts
const take = Math.min(dto.limit ?? 20, 100);
```

### 4.4 Soft delete y auditoría de cambios

- Usá `@DeleteDateColumn` para borrados lógicos de datos importantes (permite recuperación y auditoría).
- Pero respetá el **derecho de supresión** del usuario: cuando pide borrar su cuenta, anonimizá o eliminá definitivamente sus datos personales (sección 24).

---

## 5. NestJS: configuración base segura (`main.ts`)

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Detrás del proxy de Railway: para obtener la IP real del cliente (rate limiting, logs)
  app.set('trust proxy', 1);

  // 2. Límite de tamaño del body (evita ataques de payloads gigantes)
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  // 3. Headers de seguridad HTTP
  app.use(helmet());

  // 4. Lectura de cookies
  app.use(cookieParser());

  // 5. CORS restringido a tu frontend
  app.enableCors({
    origin: [process.env.FRONTEND_URL!],   // ❗ nunca '*' con credenciales
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  });

  // 6. Validación global estricta
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true,   // y rechaza la request si las hay
      transform: true,
      disableErrorMessages: false,
    }),
  );

  // 7. Ocultar la tecnología del servidor
  app.disable('x-powered-by');

  // 8. Documentación Swagger solo fuera de producción
  if (!isProd) {
    // SwaggerModule.setup('docs', app, document);
  }

  // 9. Apagado ordenado (cierra conexiones a la DB)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
```

### 5.1 Guards globales: denegar por defecto

Registrá los guards de forma global en `AppModule`, así **toda ruta es privada** salvo que la marques con `@Public()`:

```ts
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard }, // rate limiting (sección 16)
  { provide: APP_GUARD, useClass: OriginGuard },    // CSRF (sección 12)
  { provide: APP_GUARD, useClass: AuthGuard },      // autenticación (sección 9)
  { provide: APP_GUARD, useClass: RolesGuard },     // autorización (sección 13)
  { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }, // aplica @Exclude
],
```

> El orden importa: primero se limita la tasa, después se verifica el origen, después quién sos y por último qué podés hacer.

### 5.2 Manejo de errores sin filtrar información

- Nunca devuelvas stack traces, mensajes de error de PostgreSQL ni nombres de tablas al cliente.
- NestJS ya responde `500 Internal server error` genérico para excepciones no controladas; registrá el detalle **solo en los logs**.

```ts
// src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }
    this.logger.error(exception);                       // detalle solo en logs
    return res.status(500).json({ statusCode: 500, message: 'Error interno' });
  }
}
```

---

## 6. Validación de entrada y salida (DTOs y serialización)

### 6.1 Entrada: todo endpoint recibe un DTO validado

```ts
// src/auth/dto/register.dto.ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128) // límite superior: evita DoS con contraseñas enormes en el hash
  password: string;
}
```

Reglas:
- **Todo string con `@MaxLength`**.
- **IDs con `@IsUUID()`** (o `ParseUUIDPipe` en parámetros: `@Param('id', ParseUUIDPipe) id: string`).
- Enums con `@IsEnum()`, números con `@IsInt() @Min() @Max()`.
- **Mass assignment:** el DTO de registro o de editar perfil **no tiene** campo `role`. Con `whitelist + forbidNonWhitelisted`, si alguien manda `"role": "ADMIN"` la request se rechaza.

### 6.2 Salida: devolvé solo lo necesario

Usá DTOs de respuesta en vez de devolver entidades completas:

```ts
export class UserResponseDto {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;

  static from(u: User): UserResponseDto {
    return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt };
  }
}
```

Así, aunque mañana alguien agregue una columna sensible a la entidad, no se filtra automáticamente.

---

## 7. Registro de usuarios y contraseñas

### 7.1 Hashing con argon2id

Nunca guardes contraseñas en texto plano ni con MD5/SHA-1/SHA-256 simples. Usá **argon2id** (recomendado por OWASP) o, como alternativa, bcrypt con costo ≥ 12.

```bash
npm i argon2
```

```ts
// src/auth/password.service.ts
import * as argon2 from 'argon2';

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (mínimo OWASP)
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  hash(plain: string) {
    return argon2.hash(plain, ARGON_OPTIONS);
  }
  verify(hash: string, plain: string) {
    return argon2.verify(hash, plain);
  }
}
```

argon2 genera y guarda el *salt* automáticamente dentro del hash.

### 7.2 Política de contraseñas (alineada con NIST SP 800-63B)

- Mínimo **12 caracteres** (NIST exige 8; 12 es más robusto). Máximo 64–128.
- **Permitir** espacios, frases y cualquier carácter (las *passphrases* son seguras y fáciles de recordar).
- **No** obligar a combinaciones raras ("una mayúscula, un símbolo...") ni a cambiarla cada 90 días: generan contraseñas peores.
- **Sí** rechazar contraseñas filtradas o comunes. Podés consultar la API de *Have I Been Pwned* con k-anonymity (solo enviás los primeros 5 caracteres del hash SHA-1, nunca la contraseña).
- Rechazar contraseñas iguales al email o al nombre.

### 7.3 Flujo de registro seguro

1. Validar DTO.
2. Verificar contraseña contra lista de filtradas.
3. Hashear con argon2id.
4. Crear usuario con `role = USER` **siempre** (el rol nunca viene del cliente).
5. Enviar email de verificación (sección 14).
6. **Respuesta genérica** para no revelar si un email ya está registrado:

```ts
async register(dto: RegisterDto) {
  const exists = await this.usersRepo.exist({ where: { email: dto.email } });
  if (!exists) {
    const passwordHash = await this.passwords.hash(dto.password);
    await this.usersRepo.save({ email: dto.email, passwordHash, role: Role.USER });
    await this.mail.sendVerification(dto.email);
  } else {
    // Opcional: avisar al dueño del email "alguien intentó registrarse con tu cuenta"
    await this.mail.sendAlreadyRegisteredNotice(dto.email);
  }
  return { message: 'Si los datos son válidos, te enviamos un email para continuar.' };
}
```

> Esto evita la **enumeración de usuarios** (que un atacante descubra qué emails tienen cuenta).

---

## 8. Login

### 8.1 Reglas del login

- **Mensaje de error genérico:** "Email o contraseña incorrectos". Nunca "el email no existe" o "la contraseña es incorrecta".
- **Tiempo de respuesta similar** exista o no el usuario (si no existe, igual se verifica contra un hash falso).
- **Bloqueo progresivo** tras intentos fallidos (sección 16).
- Verificar que el email esté confirmado (si tu app lo exige) y que la cuenta no esté bloqueada ni eliminada.
- **Regenerar la sesión** en cada login (nuevo token; nunca reutilizar uno previo).

```ts
// src/auth/auth.service.ts
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$...'; // generalo una vez con PasswordService.hash()

async validateCredentials(email: string, password: string): Promise<User> {
  const user = await this.usersRepo
    .createQueryBuilder('u')
    .addSelect('u.passwordHash')
    .where('u.email = :email', { email: email.trim().toLowerCase() })
    .getOne();

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedException('Email o contraseña incorrectos');
  }

  // Siempre ejecutamos verify para que el tiempo de respuesta sea similar
  const valid = await this.passwords.verify(user?.passwordHash ?? DUMMY_HASH, password);

  if (!user || !valid) {
    if (user) await this.registerFailedAttempt(user);
    throw new UnauthorizedException('Email o contraseña incorrectos');
  }

  await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
  return user;
}
```

### 8.2 Notificaciones de seguridad

Enviá un email al usuario cuando:
- Inicia sesión desde un dispositivo o ubicación nueva.
- Cambia su contraseña o email.
- Activa o desactiva el 2FA.

---

## 9. Tokens, sesiones y cookies

### 9.1 Estrategia recomendada

| Elemento | Formato | Duración | Dónde vive |
|---|---|---|---|
| **Access token** | JWT firmado | 10–15 minutos | Cookie `httpOnly` |
| **Refresh token** | Aleatorio opaco (no JWT) | 7–30 días | Cookie `httpOnly` con `path` restringido; **su hash** en la tabla `sessions` |

**¿Por qué cookies `httpOnly` y no `localStorage`?** Todo lo que está en `localStorage` lo puede leer cualquier script de la página. Si hay una sola vulnerabilidad XSS, roban los tokens. Una cookie `httpOnly` no es accesible desde JavaScript.

### 9.2 Configuración de cookies

```ts
// src/auth/cookies.ts
import { CookieOptions, Response } from 'express';

const isProd = process.env.NODE_ENV === 'production';

const base: CookieOptions = {
  httpOnly: true,            // inaccesible desde JavaScript
  secure: isProd,            // solo por HTTPS
  sameSite: 'lax',           // bloquea envío en la mayoría de requests cross-site
  domain: process.env.COOKIE_DOMAIN, // ej: '.midominio.com' (ver sección 22)
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, { ...base, path: '/', maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, {
    ...base,
    path: '/auth',           // solo se envía a /auth/refresh y /auth/logout
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/auth' });
}
```

Atributos explicados:
- **`httpOnly`**: protege contra robo por XSS.
- **`secure`**: nunca viaja por HTTP plano.
- **`sameSite`**: `strict` es más seguro pero rompe la navegación desde links externos (el usuario llega deslogueado); `lax` es el equilibrio habitual. `none` solo si es imprescindible (front y back en dominios distintos) y obliga a una protección CSRF más fuerte.
- **`path`**: el refresh token solo viaja a las rutas que lo necesitan.
- **Prefijo `__Host-`**: si front y API comparten exactamente el mismo origen (sin `domain`), podés nombrar la cookie `__Host-access_token` para que el navegador exija `secure`, `path=/` y sin `domain`. Con subdominios compartidos no aplica.

### 9.3 Guard de autenticación global

```ts
// src/common/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```ts
// src/common/guards/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.['access_token'];
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],      // ❗ fijar algoritmo: evita ataques "alg: none"
        issuer: 'mi-api',
        audience: 'mi-frontend',
      });
      req.user = { id: payload.sub, role: payload.role, sid: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

Al firmar:

```ts
this.jwt.signAsync(
  { sub: user.id, role: user.role, sid: session.id },
  { secret: accessSecret, expiresIn: '15m', algorithm: 'HS256', issuer: 'mi-api', audience: 'mi-frontend' },
);
```

Reglas sobre JWT:
- El payload **no está cifrado**, solo firmado: cualquiera puede leerlo. Nunca pongas datos sensibles.
- Secret de al menos 64 bytes aleatorios.
- Expiración corta. Si cambia el rol de un usuario, el cambio se aplica como máximo cuando expire el access token; para acciones críticas, verificá el rol contra la base (sección 13).

---

## 10. Refresh tokens con rotación

### 10.1 Tabla de sesiones

```ts
// src/sessions/session.entity.ts
@Entity({ name: 'sessions' })
export class Session {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;

  @Index()
  @Column({ name: 'family_id', type: 'uuid' }) familyId: string; // cadena de rotación

  @Index({ unique: true })
  @Column({ name: 'token_hash' }) tokenHash: string; // SHA-256 del refresh token

  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ name: 'user_agent', nullable: true }) userAgent: string | null;
  @Column({ nullable: true }) ip: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
```

### 10.2 Generación y almacenamiento

```ts
import { createHash, randomBytes } from 'crypto';

const generateRefreshToken = () => randomBytes(32).toString('base64url');
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
```

> Guardás **solo el hash**. Si roban la base, los refresh tokens no sirven. (SHA-256 alcanza aquí porque el token es aleatorio de 256 bits; para contraseñas humanas sí hace falta argon2.)

### 10.3 Rotación con detección de reutilización

En cada `/auth/refresh`:

1. Leer `refresh_token` de la cookie y buscar su hash.
2. Si **no existe o expiró** → 401 y borrar cookies.
3. Si **ya estaba revocado** → ⚠️ alguien está reutilizando un token robado: **revocar toda la familia** (todas las sesiones de esa cadena) y responder 401.
4. Si es válido → revocarlo, crear uno nuevo con el mismo `familyId`, emitir un nuevo access token y setear ambas cookies.

```ts
@Public()
@Post('refresh')
@HttpCode(200)
async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const raw = req.cookies?.['refresh_token'];
  if (!raw) throw new UnauthorizedException();

  const session = await this.sessionsRepo.findOne({ where: { tokenHash: hashToken(raw) } });

  if (!session || session.expiresAt < new Date()) {
    clearAuthCookies(res);
    throw new UnauthorizedException();
  }

  if (session.revokedAt) {
    // Reutilización detectada: posible robo
    await this.sessionsRepo.update({ familyId: session.familyId }, { revokedAt: new Date() });
    await this.audit.log('REFRESH_TOKEN_REUSE', session.userId, req);
    clearAuthCookies(res);
    throw new UnauthorizedException();
  }

  await this.sessionsRepo.update(session.id, { revokedAt: new Date() });
  const { accessToken, refreshToken } = await this.issueTokens(session.userId, session.familyId, req);
  setAuthCookies(res, accessToken, refreshToken);
  return { ok: true };
}
```

Extras:
- **Expiración absoluta:** aunque se rote, una familia no debería vivir más de, por ejemplo, 30 días; luego se pide login de nuevo.
- **Limpieza:** un job periódico que borre sesiones expiradas.
- **Página "Mis sesiones":** que el usuario vea dispositivos activos y pueda cerrarlos.

---

## 11. Logout y revocación de sesiones

### 11.1 Logout correcto

Borrar la cookie en el navegador **no alcanza**: si el token fue robado, sigue siendo válido. Hay que **revocarlo en el servidor**.

```ts
@Post('logout')
@HttpCode(200)
async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const raw = req.cookies?.['refresh_token'];
  if (raw) {
    await this.sessionsRepo.update({ tokenHash: hashToken(raw) }, { revokedAt: new Date() });
  }
  clearAuthCookies(res);
  return { ok: true };
}
```

### 11.2 "Cerrar sesión en todos los dispositivos"

```ts
await this.sessionsRepo.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
```

Ejecutalo automáticamente cuando:
- El usuario cambia o recupera su contraseña.
- Se detecta reutilización de refresh token.
- Un admin bloquea la cuenta.
- El usuario cambia su email o desactiva el 2FA.

### 11.3 Revocación inmediata del access token (opcional)

Como el access token dura 15 minutos, tras un logout queda una ventana corta. Si necesitás revocación inmediata (apps muy sensibles), incluí el `sid` (id de sesión) en el JWT y verificá en el `AuthGuard` que esa sesión no esté revocada (con caché en Redis para no consultar la base en cada request).

### 11.4 En el frontend

Tras el logout: limpiar estado global (contextos, stores, caché de React Query/SWR) y redirigir a login con `router.replace` para que el botón "atrás" no muestre datos.

---

## 12. Protección CSRF

**CSRF** = un sitio malicioso hace que el navegador del usuario envíe una request a tu API usando sus cookies.

Capas de protección (usá todas):

1. **`SameSite=Lax`** en las cookies: el navegador no las envía en POST cross-site.
2. **Nunca modificar datos con GET.** GET solo lee.
3. **Verificar el header `Origin`** en todas las requests que modifican datos.
4. **Exigir un header personalizado** (`X-Requested-With`): un formulario HTML de otro sitio no puede agregarlo, y un `fetch` cross-site con ese header dispara un *preflight* CORS que tu API rechaza.

```ts
// src/common/guards/origin.guard.ts
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const allowed = [this.config.get<string>('FRONTEND_URL')];
    if (!origin || !allowed.includes(origin)) {
      throw new ForbiddenException('Origen no permitido');
    }
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new ForbiddenException('Header requerido ausente');
    }
    return true;
  }
}
```

> Si tu app necesita `SameSite=None` (front y back en dominios sin relación), sumá además un **token CSRF** con el patrón *double submit cookie* (por ejemplo con la librería `csrf-csrf`).

---

## 13. Autorización: roles (RBAC) y propiedad de recursos

**Autenticación** = quién sos. **Autorización** = qué podés hacer. La mayoría de los hackeos reales a aplicaciones web son fallas de **autorización** (OWASP Top 10 #1: *Broken Access Control*).

### 13.1 Decorador y guard de roles

```ts
// src/common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true; // ya autenticado por AuthGuard
    const { user } = ctx.switchToHttp().getRequest();
    if (!user || !required.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
```

```ts
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

Uso:

```ts
@Controller('admin/users')
@Roles(Role.ADMIN)                  // todo el controlador es solo para ADMIN
export class AdminUsersController {
  @Get()
  list(@Query() q: PaginationDto) { /* ... */ }

  @Patch(':id/role')
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.changeRole(id, dto.role, admin);
  }
}
```

### 13.2 Propiedad de recursos (anti-IDOR)

El rol no alcanza: un USER puede ver *sus* pedidos, no *todos* los pedidos. **Filtrá siempre por el dueño en la consulta:**

```ts
// ❌ IDOR: cualquier usuario logueado ve cualquier pedido cambiando el ID
findOne(id: string) {
  return this.ordersRepo.findOne({ where: { id } });
}

// ✅ Correcto
async findOneForUser(id: string, user: AuthUser) {
  const where = user.role === Role.ADMIN ? { id } : { id, userId: user.id };
  const order = await this.ordersRepo.findOne({ where });
  if (!order) throw new NotFoundException(); // 404 y no 403: no revelar que existe
  return order;
}
```

Lo mismo para **update** y **delete**: `update({ id, userId: user.id }, data)`, nunca `update(id, data)` a secas.

### 13.3 Reglas de oro de autorización

- **Cada endpoint** se verifica en el backend. El frontend solo oculta botones por UX.
- **Re-verificá el rol contra la base** en acciones críticas (cambiar roles, borrar usuarios, ver datos de pagos), no solo el del JWT.
- Un admin **no puede quitarse su propio rol ADMIN** si es el último admin, ni escalar privilegios por encima del suyo.
- Para cambios de rol, cambios de email o borrado de cuenta: **pedí reautenticación** (contraseña o 2FA) aunque haya sesión activa.
- Si los permisos crecen, pasá de roles simples a **permisos granulares** (`users:read`, `users:write`, `orders:refund`) asignados a roles.

---

## 14. Verificación de email y recuperación de contraseña

### 14.1 Tokens de un solo uso

Para verificación de email, reset de contraseña e invitaciones:

```ts
const token = randomBytes(32).toString('base64url'); // va en el link del email
const tokenHash = hashToken(token);                   // esto se guarda en la base
```

Tabla `one_time_tokens`: `id`, `user_id`, `type` (`EMAIL_VERIFY` | `PASSWORD_RESET`), `token_hash`, `expires_at`, `used_at`.

Reglas:
- **Expiración corta:** reset de contraseña 15–30 minutos; verificación de email 24 horas.
- **Un solo uso:** marcar `used_at` al usarlo, de forma atómica.
- Al generar uno nuevo, **invalidar los anteriores** del mismo tipo.
- Guardar **solo el hash**.

### 14.2 Flujo de "olvidé mi contraseña"

1. Usuario ingresa su email.
2. Respuesta **siempre igual**: "Si el email está registrado, te enviamos un enlace" (anti-enumeración).
3. Rate limit estricto: por ejemplo 3 solicitudes por hora por email e IP.
4. El link lleva al frontend: `https://midominio.com/reset?token=...`.
5. El usuario define la nueva contraseña (aplicando la política de la sección 7).
6. Backend: valida token → actualiza hash → marca token usado → **revoca todas las sesiones** → envía email de confirmación ("tu contraseña fue cambiada; si no fuiste vos, contactanos").

> ⚠️ Generá los links con una URL base **fija desde la configuración** (`FRONTEND_URL`), nunca a partir del header `Host` de la request: un atacante podría manipularlo y hacer que el email lleve el token a su dominio (*host header injection*).

### 14.3 Cambio de email

Pedí la contraseña actual, enviá confirmación al **nuevo** email y un aviso al **viejo** email con opción de revertir.

---

## 15. Autenticación en dos pasos (MFA/2FA)

Recomendado como opcional para usuarios y **obligatorio para administradores**.

**Opción principal: TOTP** (Google Authenticator, Authy, 1Password) con una librería como `otplib`.

Flujo de activación:
1. Generar un secret TOTP y mostrarlo como código QR.
2. El usuario escanea y escribe el código de 6 dígitos para confirmar.
3. Recién ahí se activa. Guardar el secret **cifrado** (sección 3.4).
4. Generar **códigos de recuperación** (8–10 códigos de un solo uso), mostrarlos una única vez y guardar solo su hash.

Flujo de login con 2FA:
1. Email + contraseña correctos → respuesta `{ mfaRequired: true }` y un token temporal de corta vida (5 min) que **solo** sirve para el paso de 2FA.
2. El usuario envía el código TOTP → recién ahí se emiten las cookies de sesión.
3. Rate limit estricto al endpoint de verificación (6 dígitos son solo un millón de combinaciones).
4. Rechazar la reutilización del mismo código dentro de su ventana de validez.

Evitá SMS como único segundo factor si podés (vulnerable a *SIM swapping*). La opción más fuerte son las **passkeys/WebAuthn** (resistentes a phishing); considerá sumarlas a futuro.

---

## 16. Rate limiting y protección contra fuerza bruta

### 16.1 Rate limiting global con `@nestjs/throttler`

```ts
// app.module.ts
ThrottlerModule.forRoot([
  { name: 'default', ttl: 60_000, limit: 100 }, // 100 requests por minuto por IP
]),
```

Límites más estrictos en endpoints sensibles:

```ts
@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 intentos por minuto
@Post('login')
login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) { /* ... */ }
```

| Endpoint | Límite sugerido |
|---|---|
| `POST /auth/login` | 5/min por IP |
| `POST /auth/register` | 3/min por IP |
| `POST /auth/forgot-password` | 3/hora por IP |
| `POST /auth/mfa/verify` | 5/min |
| Resto de la API | 100/min |

> Con varias instancias del backend, usá un *storage* compartido (Redis) para el throttler; si no, cada instancia cuenta por separado. Recordá `trust proxy` (sección 5) para que la IP sea la del cliente real y no la del proxy.

### 16.2 Bloqueo por cuenta (no solo por IP)

Los atacantes rotan IPs. Llevá también la cuenta por usuario:

```ts
private async registerFailedAttempt(user: User) {
  const attempts = user.failedLoginAttempts + 1;
  // Bloqueo progresivo: 5 fallos → 1 min, 10 → 15 min, 15+ → 1 hora
  const lockMinutes = attempts >= 15 ? 60 : attempts >= 10 ? 15 : attempts >= 5 ? 1 : 0;
  await this.usersRepo.update(user.id, {
    failedLoginAttempts: attempts,
    lockedUntil: lockMinutes ? new Date(Date.now() + lockMinutes * 60_000) : null,
  });
}
```

> Usá bloqueos **temporales y progresivos**, no permanentes: un bloqueo permanente permite que un atacante bloquee cuentas ajenas a propósito.

### 16.3 CAPTCHA

Ante muchos fallos o en registro, agregá un CAPTCHA amigable (Cloudflare Turnstile, hCaptcha). **Verificalo siempre en el backend**, no solo en el frontend.

---

## 17. Subida de archivos

Si tu app permite subir archivos (avatares, documentos):

- **Límite de tamaño** en Multer: `limits: { fileSize: 5 * 1024 * 1024, files: 1 }`.
- **Lista blanca de tipos** verificando el contenido real (*magic bytes*, con la librería `file-type`), no solo la extensión ni el `Content-Type` que manda el cliente.
- **Renombrar** con un nombre aleatorio (uuid). Nunca uses el nombre original como ruta (riesgo de *path traversal* con `../../`).
- **Guardar fuera del servidor**: en almacenamiento de objetos (S3, Cloudflare R2, etc.) y no en el filesystem de la app (en Railway además es efímero).
- Servir archivos privados con **URLs firmadas** de corta duración.
- **No servir SVG ni HTML subidos por usuarios** desde tu dominio principal (pueden contener scripts). Si los aceptás, sanitizalos o servilos desde otro dominio con `Content-Disposition: attachment`.
- Reprocesar imágenes (por ejemplo con `sharp`) elimina metadatos EXIF (que pueden incluir la ubicación GPS del usuario) y contenido malicioso incrustado.
- Para documentos de terceros, considerá un escaneo antivirus.

---

## 18. Dashboard de administración

El panel de admin es el objetivo más valioso para un atacante.

1. **Doble protección:** el layout del frontend redirige si no sos admin (UX), y **cada endpoint** `/admin/*` tiene `@Roles(Role.ADMIN)` (seguridad real).
2. **2FA obligatorio** para cuentas con rol ADMIN o EDITOR.
3. **Sesiones más cortas** para admins (por ejemplo, refresh de 8–12 horas en lugar de 7 días).
4. **Reautenticación** para acciones destructivas (borrar usuarios, cambiar roles, exportar datos).
5. **Registro de auditoría** de toda acción administrativa (sección 20).
6. **Datos enmascarados por defecto:** mostrar `j***@gmail.com` o `****1234` y revelar el dato completo solo bajo demanda (y registrarlo).
7. **Exportaciones limitadas:** las descargas masivas (CSV de usuarios) solo con permiso específico, con límite y auditadas.
8. **Ruta no indexada:** `robots.txt` con `Disallow` y `noindex`. Esto **no** es seguridad (es seguridad por oscuridad), solo reduce exposición.
9. Opcional: restringir el acceso al panel por IP o VPN si el equipo es chico.
10. **Nunca** crear admins desde un endpoint público. El primer admin se crea con un script o seed ejecutado manualmente.

---

## 19. Frontend en TypeScript (Next.js/React)

### 19.1 Llamadas a la API con cookies

```ts
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',                       // envía las cookies
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',       // requerido por el OriginGuard
      ...init.headers,
    },
  });

  if (res.status === 401) {
    // Intentar refrescar una vez; si falla, ir al login
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (refreshed.ok) return api<T>(path, init);
    window.location.href = '/login';
  }

  if (!res.ok) throw new Error('Error en la solicitud');
  return res.json() as Promise<T>;
}
```

> En producción, evitá refrescos simultáneos: si varias requests reciben 401 a la vez, que compartan una sola promesa de refresh.

### 19.2 Variables de entorno en el frontend

- **Todo lo que empiece con `NEXT_PUBLIC_` es público**: termina en el JavaScript que descarga cualquier visitante.
- Ahí solo va la URL de la API o claves públicas (por ejemplo, la *site key* del CAPTCHA).
- **Nunca** secrets, claves privadas, credenciales de base de datos ni API keys privadas.

### 19.3 Protección de rutas en Next.js

- El **middleware** de Next.js sirve para redirigir rápido si no hay cookie de sesión (UX). **No es la barrera de seguridad**: la seguridad real está en el backend NestJS. (En 2025 se publicó la CVE-2025-29927, que permitía saltear el middleware de Next.js; mantené Next.js actualizado.)
- En Server Components, si llamás a la API desde el servidor de Next.js, reenviá las cookies del usuario:

```ts
import { cookies } from 'next/headers';

const cookieStore = await cookies();
const res = await fetch(`${process.env.API_URL}/me`, {
  headers: { cookie: cookieStore.toString() },
  cache: 'no-store',          // ❗ nunca cachear respuestas con datos de usuario
});
```

- **Cuidado con la caché:** una respuesta personalizada cacheada puede mostrarse a otro usuario. Usá `cache: 'no-store'` o rutas dinámicas para datos privados.

### 19.4 Prevención de XSS

- React escapa automáticamente lo que renderizás con `{variable}`. Mantenelo así.
- **Evitá `dangerouslySetInnerHTML`.** Si es imprescindible (contenido enriquecido), sanitizá con **DOMPurify**.
- **Validá URLs dinámicas:** `<a href={userUrl}>` con `javascript:alert(1)` ejecuta código. Permití solo `http:` y `https:`:

```ts
const safeUrl = (u: string) => {
  try {
    const url = new URL(u);
    return ['http:', 'https:'].includes(url.protocol) ? u : '#';
  } catch {
    return '#';
  }
};
```

- No uses `eval`, `new Function` ni insertes HTML con `innerHTML`.

### 19.5 Headers de seguridad en el frontend

```ts
// next.config.ts
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },                 // anti-clickjacking
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",                  // idealmente reemplazar por nonces
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

export default {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

> La **CSP** es la mejor defensa contra XSS. Empezá en modo `Content-Security-Policy-Report-Only` para ver qué se rompería, ajustá, y después activala. Lo ideal a largo plazo es usar *nonces* en lugar de `'unsafe-inline'` para scripts.

### 19.6 Formularios

- Validá también en el frontend (con Zod o similar), pero **solo por UX**: la validación que importa es la del backend.
- Usá `autocomplete="current-password"` y `"new-password"` para que funcionen los gestores de contraseñas.
- Nunca guardes contraseñas ni tokens en `localStorage`, `sessionStorage` ni en el estado persistido.

---

## 20. Logs, auditoría y monitoreo

### 20.1 Logging estructurado sin datos sensibles

Usá un logger estructurado (por ejemplo `nestjs-pino`) con **redacción** de campos sensibles:

```ts
LoggerModule.forRoot({
  pinoHttp: {
    redact: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.body.password',
      'req.body.token',
      'res.headers["set-cookie"]',
    ],
  },
}),
```

**Nunca loguees:** contraseñas, tokens, cookies, números de tarjeta, secrets ni el contenido completo de datos personales.

### 20.2 Registro de auditoría

Tabla `audit_logs` (solo inserción, nunca update ni delete por la app):

| Campo | Ejemplo |
|---|---|
| `id` | uuid |
| `actor_id` | quién lo hizo |
| `action` | `USER_ROLE_CHANGED`, `LOGIN_FAILED`, `PASSWORD_RESET`, `DATA_EXPORTED` |
| `target_type` / `target_id` | sobre qué recurso |
| `metadata` | jsonb con detalles (sin datos sensibles) |
| `ip`, `user_agent` | origen |
| `created_at` | timestamp |

Eventos que sí o sí se registran: logins exitosos y fallidos, logout, cambios de contraseña/email/2FA, cambios de rol, acciones administrativas, exportaciones de datos, reutilización de refresh tokens, accesos denegados (403) repetidos.

> Para que la app no pueda borrar auditoría: dale a `app_user` solo `INSERT` y `SELECT` sobre `audit_logs` (`REVOKE UPDATE, DELETE`).

### 20.3 Monitoreo y alertas

- **Errores:** Sentry (backend y frontend), configurado para **no** enviar datos personales (`sendDefaultPii: false`).
- **Alertas** ante: picos de logins fallidos, muchas respuestas 401/403, reutilización de refresh tokens, errores 500 repetidos.
- **Uptime:** un monitor externo que chequee `/health`.
- Retención de logs definida (por ejemplo 90 días) y luego borrado.

---

## 21. Dependencias y cadena de suministro

- `npm audit` regularmente y antes de cada deploy (`npm audit --omit=dev` para producción).
- **Dependabot** o **Renovate** en GitHub para actualizaciones automáticas.
- **Commitear el lockfile** (`package-lock.json`) y usar `npm ci` en CI/CD para builds reproducibles.
- Antes de instalar un paquete: verificá popularidad, mantenimiento y que el nombre sea el correcto (los atacantes publican paquetes con nombres casi iguales: *typosquatting*).
- Activá **secret scanning** y **push protection** en GitHub, y usá `gitleaks` como hook de pre-commit.
- Activá **CodeQL** (análisis estático gratuito en repos públicos de GitHub).
- Protegé la rama `main`: pull requests obligatorios y checks de CI en verde antes de mergear.
- Activá **2FA en todas tus cuentas**: GitHub, Vercel, Railway, proveedor de email, registrador de dominio. Una cuenta de deploy comprometida equivale a todo el sistema comprometido.

---

## 22. Deploy: Vercel + Railway

### 22.1 El problema de las cookies entre dominios

Si tu frontend está en `miapp.vercel.app` y tu backend en `miapi.up.railway.app`, son **sitios distintos**. Los navegadores bloquean cada vez más las cookies de terceros, y te obligaría a usar `SameSite=None` (más riesgo de CSRF).

**Solución recomendada: dominio propio con subdominios.**

```
https://midominio.com        → Frontend (Vercel)
https://api.midominio.com    → Backend NestJS (Railway)
```

- Cookies con `domain: '.midominio.com'` (o sin `domain` si solo la usa la API) y `SameSite=Lax`.
- Front y back son el **mismo sitio**, las cookies funcionan sin problemas y CSRF queda mucho más acotado.

**Alternativa:** usar *rewrites* de Next.js para que el front haga de proxy (`/api/*` → backend). Así el navegador solo habla con un origen.

### 22.2 Checklist de Railway (backend + base)

- [ ] Variables de entorno cargadas en Railway, ninguna en el código.
- [ ] `NODE_ENV=production`.
- [ ] Backend conectado a Postgres por **red privada**; base sin exposición pública innecesaria.
- [ ] Backups automáticos activos y restauración probada.
- [ ] Migraciones ejecutadas como paso de deploy controlado (no `synchronize`).
- [ ] Endpoint `/health` sin datos sensibles.
- [ ] Swagger deshabilitado en producción.

### 22.3 Checklist de Vercel (frontend)

- [ ] Solo variables públicas con `NEXT_PUBLIC_`.
- [ ] Headers de seguridad y CSP configurados.
- [ ] Previews de ramas protegidos (Vercel permite proteger deployments de preview) y conectados a una API de **staging**, nunca a la base de producción.
- [ ] HTTPS forzado (Vercel lo hace por defecto) y HSTS activo.

### 22.4 Entornos separados

| Entorno | Base de datos | Secrets |
|---|---|---|
| Desarrollo | Local (Docker) | Propios |
| Staging | Base de staging con datos **falsos** | Propios |
| Producción | Base de producción | Propios |

**Nunca** copies datos reales de producción a desarrollo sin anonimizarlos.

---

## 23. Testing de seguridad

### 23.1 Tests e2e de autorización (los más importantes)

```ts
// test/orders.e2e-spec.ts
describe('Orders - autorización', () => {
  it('rechaza sin sesión (401)', () =>
    request(app.getHttpServer()).get('/orders').expect(401));

  it('un USER no puede ver pedidos de otro usuario (404)', async () => {
    const cookies = await loginAs(userA);
    await request(app.getHttpServer())
      .get(`/orders/${orderOfUserB.id}`)
      .set('Cookie', cookies)
      .expect(404);
  });

  it('un USER no puede acceder al panel admin (403)', async () => {
    const cookies = await loginAs(userA);
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', cookies)
      .expect(403);
  });

  it('rechaza mass assignment de role (400)', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', FRONTEND_URL)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'x@x.com', password: 'una-frase-larga-segura', role: 'ADMIN' })
      .expect(400);
  });
});
```

Escribí un test de este tipo **por cada endpoint protegido**. Si en el futuro alguien (o una IA) rompe un permiso, el test falla antes de llegar a producción.

### 23.2 Más pruebas

- Tests del flujo de refresh: rotación correcta y detección de reutilización.
- Tests de rate limiting en login.
- Tests de que las respuestas **no incluyen** `passwordHash` ni otros campos sensibles.
- **Escaneo dinámico** con OWASP ZAP contra staging.
- Revisar el sitio con herramientas de headers (por ejemplo, Mozilla Observatory o securityheaders.com).
- Para proyectos con datos muy sensibles: **pentest profesional** antes de lanzar.

---

## 24. Privacidad y cumplimiento legal

> Esto es orientativo, no asesoramiento legal. Si manejás datos sensibles o a gran escala, consultá con un profesional.

- **Argentina:** la **Ley 25.326 de Protección de Datos Personales** regula el tratamiento de datos. El organismo de control es la **AAIP** (Agencia de Acceso a la Información Pública). Revisá las obligaciones vigentes, como la inscripción de bases de datos.
- **Usuarios de la Unión Europea:** aplica el **GDPR**.
- **Política de privacidad** clara: qué datos recolectás, para qué, cuánto tiempo los guardás y con quién los compartís.
- **Consentimiento** explícito para usos no esenciales (newsletters, analytics con cookies de seguimiento).
- **Derechos del usuario:** acceso, rectificación y supresión. Implementá "descargar mis datos" y "eliminar mi cuenta".
- **Retención:** definí plazos y borrá automáticamente lo que ya no necesitás.
- **Proveedores:** cualquier servicio que reciba datos de tus usuarios (email, analytics, Sentry) también procesa esos datos; elegilos con cuidado y configuralos para enviar lo mínimo.

---

## 25. Respuesta ante incidentes

Prepará esto **antes** de necesitarlo:

1. **Contener:** revocar todas las sesiones (`UPDATE sessions SET revoked_at = now()`), rotar secrets (JWT, base de datos, API keys), deshabilitar el endpoint vulnerable.
2. **Investigar:** revisar logs y auditoría: qué se accedió, desde cuándo, qué usuarios están afectados.
3. **Corregir:** parchear la vulnerabilidad y agregar un test que la cubra.
4. **Notificar:** a los usuarios afectados y, si corresponde, a la autoridad de control.
5. **Aprender:** documentar qué pasó y qué cambia para que no se repita.

Tené a mano un documento con: cómo rotar cada secret, cómo revocar sesiones masivamente y cómo restaurar un backup.

También es buena práctica publicar un archivo `/.well-known/security.txt` con un email de contacto para que investigadores puedan reportarte vulnerabilidades.

---

## 26. Usar Claude Code para reforzar la seguridad

### 26.1 Reglas de seguridad en tu `CLAUDE.md`

```markdown
## Reglas de seguridad (obligatorias)
- Toda ruta es privada por defecto; solo usar @Public() en login, registro, refresh, forgot/reset password y health.
- Todo endpoint admin lleva @Roles(Role.ADMIN).
- Toda consulta sobre recursos de usuario filtra por userId (anti-IDOR); responder 404 si no es del usuario.
- Todo input entra por un DTO con class-validator; todo string tiene @MaxLength; los IDs usan ParseUUIDPipe.
- Nunca devolver entidades completas: usar DTOs de respuesta. Nunca exponer passwordHash.
- Nunca concatenar strings en SQL ni en QueryBuilder: siempre parámetros.
- Contraseñas con argon2id. Tokens de un solo uso: guardar solo su hash SHA-256.
- Cookies de auth: httpOnly, secure, sameSite=lax. Nunca tokens en localStorage.
- Nunca loguear contraseñas, tokens ni cookies.
- Nunca synchronize: true; todo cambio de esquema con migración.
- Cada endpoint nuevo protegido debe tener tests e2e de 401, 403 y acceso a recursos ajenos.
```

### 26.2 Subagente auditor de seguridad

Archivo `.claude/agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Audita la seguridad del backend NestJS y el frontend. Usar después de crear o modificar endpoints, autenticación, autorización, entidades o consultas.
tools: Read, Grep, Glob, Bash
---
Sos un ingeniero de seguridad de aplicaciones senior. Auditá el código buscando:
1. Endpoints sin AuthGuard/@Roles adecuados o marcados @Public sin justificación.
2. IDOR: consultas por id sin filtrar por el usuario dueño.
3. Mass assignment: DTOs que permitan campos como role, isAdmin, userId.
4. SQL injection: concatenación de strings en queries o QueryBuilder.
5. Exposición de datos: entidades devueltas completas, campos sensibles en respuestas o logs.
6. Problemas de cookies, JWT (algoritmo no fijado, expiración larga) o refresh tokens.
7. Falta de rate limiting en endpoints de autenticación.
8. Secrets hardcodeados o variables sensibles con prefijo NEXT_PUBLIC_.
9. XSS en el frontend: dangerouslySetInnerHTML, URLs sin validar.
Pensá como un atacante. Devolvé un reporte con severidad (crítica/alta/media/baja),
archivo y línea, explicación del ataque posible y la corrección sugerida.
No modifiques archivos.
```

### 26.3 Prompts útiles

- *"Usá el subagente security-reviewer para auditar todo el módulo de auth y el de admin."*
- *"Actuá como atacante: listá todas las formas en que un usuario con rol USER podría ejecutar acciones de ADMIN o leer datos de otro usuario en este proyecto."*
- *"Generá tests e2e de autorización (401, 403 e IDOR) para todos los controladores que no los tengan."*
- Antes de cada deploy, corré el comando **`/security-review`** de Claude Code sobre tus cambios.

> Siempre **revisá vos** el código de autenticación y permisos que genere cualquier IA antes de llevarlo a producción.

---

## 27. Checklist final antes de producción

### Base de datos
- [ ] La app usa un rol de base con mínimo privilegio (no superusuario).
- [ ] Base no expuesta públicamente sin necesidad; conexión por red privada o SSL.
- [ ] Constraints (`NOT NULL`, `UNIQUE`, `CHECK`, FKs) definidos.
- [ ] Datos sensibles cifrados a nivel columna.
- [ ] `synchronize: false` y migraciones revisadas.
- [ ] Backups automáticos activos y restauración probada.

### Backend (NestJS)
- [ ] Variables de entorno validadas al arrancar; secrets fuertes y distintos por entorno.
- [ ] `helmet`, CORS restringido, límite de body, `trust proxy`.
- [ ] `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`.
- [ ] Guards globales: throttler, origen, autenticación y roles (denegar por defecto).
- [ ] Errores sin stack traces ni detalles internos.
- [ ] Swagger deshabilitado en producción.

### Autenticación y sesiones
- [ ] Contraseñas con argon2id y política alineada con NIST.
- [ ] Login con mensaje genérico, tiempo similar y bloqueo progresivo.
- [ ] Access token corto (≤15 min) y refresh token opaco con rotación y detección de reutilización.
- [ ] Cookies `httpOnly`, `secure`, `sameSite`, `path` restringido.
- [ ] Logout revoca la sesión en el servidor.
- [ ] Reset de contraseña con token hasheado, de un solo uso, de vida corta, y revocación de sesiones.
- [ ] 2FA disponible y obligatorio para administradores.
- [ ] Protección CSRF (SameSite + verificación de Origin + header personalizado).

### Autorización
- [ ] Cada endpoint verifica rol en el backend.
- [ ] Cada consulta de recursos de usuario filtra por dueño (anti-IDOR).
- [ ] Sin mass assignment de campos privilegiados.
- [ ] Reautenticación en acciones críticas.

### Frontend
- [ ] Ningún secret en variables `NEXT_PUBLIC_`.
- [ ] Ningún token en `localStorage`.
- [ ] Headers de seguridad y CSP configurados.
- [ ] Sin `dangerouslySetInnerHTML` sin sanitizar; URLs dinámicas validadas.
- [ ] Datos privados sin caché compartida.

### Operación
- [ ] Logs sin datos sensibles; auditoría de acciones críticas.
- [ ] Monitoreo de errores y alertas activas.
- [ ] `npm audit` limpio, Dependabot activo, secret scanning activo.
- [ ] 2FA en GitHub, Vercel, Railway, email y registrador de dominio.
- [ ] Dominio propio con subdominios para front y API.
- [ ] Tests e2e de autorización en verde en CI.
- [ ] Política de privacidad publicada y flujo de eliminación de cuenta.
- [ ] Plan de respuesta ante incidentes documentado.

---

## 📚 Referencias para profundizar

- **OWASP Top 10** — las vulnerabilidades web más críticas.
- **OWASP Cheat Sheet Series** — guías específicas: *Authentication*, *Password Storage*, *Session Management*, *CSRF Prevention*, *Authorization*, *File Upload*, *Logging*.
- **OWASP ASVS** (Application Security Verification Standard) — checklist exhaustivo para verificar la seguridad de una app.
- **NIST SP 800-63B** — estándar sobre contraseñas y autenticación.
- **Documentación oficial de NestJS** — secciones *Security* (Authentication, Authorization, Helmet, CORS, CSRF, Rate limiting).
- **Documentación de PostgreSQL** — *Row Security Policies* y *Database Roles*.

---

> 🔁 **La seguridad no es un estado, es un proceso.** Revisá este checklist en cada feature nuevo, mantené las dependencias actualizadas y volvé a auditar periódicamente.
