import { displayName, REVIEW_WINDOW_DAYS, reviewWindowEnd } from './review-rules';

describe('reglas de las reseñas (ADR 0028)', () => {
  it('se puede reseñar y editar hasta 30 días después de terminada', () => {
    const completed = new Date('2026-11-01T15:00:00Z');
    expect(REVIEW_WINDOW_DAYS).toBe(30);
    expect(reviewWindowEnd(completed).toISOString()).toBe('2026-12-01T15:00:00.000Z');
  });

  it('el autor se muestra con nombre e inicial, o como usuario eliminado', () => {
    expect(displayName({ firstName: 'Verónica', lastName: 'pérez', deletedAt: null })).toBe(
      'Verónica P.',
    );
    expect(displayName({ firstName: 'Cuenta', lastName: 'eliminada', deletedAt: new Date() })).toBe(
      'Usuario eliminado',
    );
  });
});
