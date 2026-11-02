import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'development',
  FRONTEND_ORIGINS: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://app:clave@localhost:5432/nexo_dev',
  JWT_ACCESS_SECRET: 'j'.repeat(64),
  CSRF_SECRET: 'c'.repeat(32),
  DATA_ENCRYPTION_KEY: 'a'.repeat(64),
  DATA_HMAC_KEY: 'h'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica las duraciones de sesión de la ADR 0008 y deja apagado el reset autoservicio', () => {
    const env = validateEnv(base);
    expect(env.ACCESS_TOKEN_TTL_SEC).toBe(600);
    expect(env.ADMIN_ACCESS_TOKEN_TTL_SEC).toBe(300);
    expect(env.REFRESH_IDLE_TTL_SEC).toBe(14 * 24 * 3600);
    expect(env.ADMIN_REFRESH_IDLE_TTL_SEC).toBe(12 * 3600);
    expect(env.REFRESH_ABSOLUTE_TTL_SEC).toBe(30 * 24 * 3600);
    expect(env.ADMIN_REFRESH_ABSOLUTE_TTL_SEC).toBe(7 * 24 * 3600);
    expect(env.PASSWORD_SELF_RESET_ENABLED).toBe(false);
    expect(env.MAX_SERVICE_AREAS).toBe(20);
  });

  it.each([
    ['JWT_ACCESS_SECRET', 'corto'],
    ['CSRF_SECRET', 'corto'],
    ['DATA_ENCRYPTION_KEY', 'no-es-hex'],
    ['DATA_HMAC_KEY', 'corto'],
  ])('rechaza un %s débil sin mostrarlo', (name, value) => {
    expect(() => validateEnv({ ...base, [name]: value })).toThrow(new RegExp(name));
    expect(() => validateEnv({ ...base, [name]: value })).not.toThrow(new RegExp(value));
  });

  it('exige DATABASE_URL de PostgreSQL sin mostrar la contraseña de la URL', () => {
    let message = '';
    try {
      validateEnv({ ...base, DATABASE_URL: 'mysql://app:contraseña-super-secreta@db/x' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('contraseña-super-secreta');
  });

  it('DATABASE_MIGRATIONS_URL es opcional y el pool tiene un valor por defecto', () => {
    const env = validateEnv(base);
    expect(env.DATABASE_MIGRATIONS_URL).toBeUndefined();
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.DB_SSL).toBe(false);
  });

  it('aplica los valores por defecto (puerto 3001, prefijo api, Swagger apagado)', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.API_PREFIX).toBe('api');
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('convierte números, booleanos y la lista de orígenes', () => {
    const env = validateEnv({
      ...base,
      PORT: '4000',
      SWAGGER_ENABLED: 'true',
      FRONTEND_ORIGINS: 'http://localhost:3000, https://staging-app.example.com',
    });
    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.FRONTEND_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://staging-app.example.com',
    ]);
  });

  it('falla si falta una variable crítica, nombrándola', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/FRONTEND_ORIGINS/);
  });

  it('nunca incluye el valor de la variable en el mensaje de error', () => {
    const secretLooking = 'ftp://valor-que-no-debe-aparecer-en-logs';
    let message = '';
    try {
      validateEnv({ ...base, FRONTEND_ORIGINS: secretLooking, PORT: 'no-es-numero-xyz' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/FRONTEND_ORIGINS/);
    expect(message).toMatch(/PORT/);
    expect(message).not.toContain('valor-que-no-debe-aparecer-en-logs');
    expect(message).not.toContain('no-es-numero-xyz');
  });

  it.each([
    '*',
    'https://*.example.com',
    'https://app.example.com/',
    'https://app.example.com/path',
  ])('rechaza orígenes que no son exactos: %s', (origin) => {
    expect(() => validateEnv({ ...base, FRONTEND_ORIGINS: origin })).toThrow(/FRONTEND_ORIGINS/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  describe('en producción', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      FRONTEND_ORIGINS: 'https://app.example.com',
      FRONTEND_URL: 'https://app.example.com',
      COOKIE_SECURE: 'true',
    };

    it('exige un proveedor real de email: consola y memoria filtrarían o perderían los enlaces', () => {
      // Hoy no hay proveedor real (pendiente): la API todavía no puede arrancar en producción.
      for (const provider of ['console', 'memory']) {
        let message = '';
        try {
          validateEnv({ ...prod, MAIL_PROVIDER: provider });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/MAIL_PROVIDER/);
        expect(message).not.toMatch(/COOKIE_SECURE|FRONTEND_URL|SWAGGER/);
      }
    });

    it('exige cookies Secure y FRONTEND_URL https', () => {
      expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
      expect(() => validateEnv({ ...prod, FRONTEND_URL: 'http://app.example.com' })).toThrow(
        /FRONTEND_URL/,
      );
    });

    it('prohíbe Swagger', () => {
      expect(() => validateEnv({ ...prod, SWAGGER_ENABLED: 'true' })).toThrow(/SWAGGER_ENABLED/);
    });

    it('exige orígenes https', () => {
      expect(() => validateEnv({ ...prod, FRONTEND_ORIGINS: 'http://app.example.com' })).toThrow(
        /FRONTEND_ORIGINS/,
      );
    });

    it('prohíbe el almacenamiento en disco y el proveedor de identidad simulado', () => {
      expect(() => validateEnv({ ...prod, STORAGE_PROVIDER: 'local' })).toThrow(/STORAGE_PROVIDER/);
      expect(() =>
        validateEnv({
          ...prod,
          IDENTITY_PROVIDER: 'fake',
          FAKE_IDENTITY_WEBHOOK_SECRET: 'f'.repeat(40),
        }),
      ).toThrow(/IDENTITY_PROVIDER/);
    });
  });

  describe('archivos e identidad', () => {
    it('por defecto: disco local y verificación manual con 3 intentos', () => {
      expect(validateEnv(base)).toMatchObject({
        STORAGE_PROVIDER: 'local',
        STORAGE_LOCAL_DIR: '.uploads',
        IDENTITY_PROVIDER: 'manual',
        IDENTITY_MAX_ATTEMPTS: 3,
      });
    });

    it('Cloudinary exige sus tres credenciales, sin mostrarlas', () => {
      let message = '';
      try {
        validateEnv({
          ...base,
          STORAGE_PROVIDER: 'cloudinary',
          CLOUDINARY_API_SECRET: 'secreto-que-no-se-muestra',
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/CLOUDINARY_CLOUD_NAME/);
      expect(message).toMatch(/CLOUDINARY_API_KEY/);
      expect(message).not.toMatch(/CLOUDINARY_API_SECRET|secreto-que-no-se-muestra/);
      expect(
        validateEnv({
          ...base,
          STORAGE_PROVIDER: 'cloudinary',
          CLOUDINARY_CLOUD_NAME: 'nube',
          CLOUDINARY_API_KEY: '123',
          CLOUDINARY_API_SECRET: 'secreto-largo-de-prueba',
        }).STORAGE_PROVIDER,
      ).toBe('cloudinary');
    });

    it('el proveedor simulado exige su secreto de webhooks', () => {
      expect(() => validateEnv({ ...base, IDENTITY_PROVIDER: 'fake' })).toThrow(
        /FAKE_IDENTITY_WEBHOOK_SECRET/,
      );
    });
  });
});
