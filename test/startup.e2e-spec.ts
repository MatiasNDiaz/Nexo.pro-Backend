import { createTestApp } from './utils/create-test-app';

describe('Arranque con configuración inválida (e2e)', () => {
  it('la app no arranca si falta una variable crítica y no muestra valores', async () => {
    // Jest aísla process.env por archivo de test.
    delete process.env.FRONTEND_ORIGINS;
    process.env.PORT = 'valor-invalido-que-no-debe-mostrarse';

    const start = createTestApp();

    await expect(start).rejects.toThrow(/FRONTEND_ORIGINS/);
    await expect(start).rejects.toThrow(/PORT/);
    await expect(start).rejects.not.toThrow(/valor-invalido-que-no-debe-mostrarse/);
  });
});
