import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'development',
  FRONTEND_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgres://app:clave@localhost:5432/nexo_dev',
};

describe('validateEnv', () => {
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
    const prod = { ...base, NODE_ENV: 'production', FRONTEND_ORIGINS: 'https://app.example.com' };

    it('acepta una configuración segura', () => {
      expect(() => validateEnv(prod)).not.toThrow();
    });

    it('prohíbe Swagger', () => {
      expect(() => validateEnv({ ...prod, SWAGGER_ENABLED: 'true' })).toThrow(/SWAGGER_ENABLED/);
    });

    it('exige orígenes https', () => {
      expect(() => validateEnv({ ...prod, FRONTEND_ORIGINS: 'http://app.example.com' })).toThrow(
        /FRONTEND_ORIGINS/,
      );
    });
  });
});
