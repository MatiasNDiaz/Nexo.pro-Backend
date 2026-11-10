import { ThemeLevel } from '../subscriptions/entities/subscription-plan.entity';
import { daysUntil, trialReminderFor } from '../subscriptions/subscriptions.service';
import { cordobaClock, effectiveAttentionStatus } from './attention-status';
import { AttentionStatus, SocialNetwork } from './professional.enums';
import { profileSlug, slugBase } from './profile-slug';
import { themeFieldsNotAllowed, themeForPlan } from './profile-theme';
import { normalizeSocialUrl } from './social-links';

// Lunes 2 de noviembre de 2026, 10:00 en Córdoba (UTC-3).
const MONDAY_10AM = new Date('2026-11-02T13:00:00Z');
const base = {
  attentionStatus: AttentionStatus.AVAILABLE,
  attentionStatusUntil: null,
  autoStatusFromSchedule: false,
  slots: [],
  exceptions: [],
};

describe('estado de atención', () => {
  it('usa la hora de Córdoba', () => {
    expect(cordobaClock(MONDAY_10AM)).toEqual({ date: '2026-11-02', weekday: 1, time: '10:00:00' });
    // 01:00 UTC del martes = 22:00 del lunes en Córdoba.
    expect(cordobaClock(new Date('2026-11-03T01:00:00Z'))).toMatchObject({
      date: '2026-11-02',
      weekday: 1,
    });
  });

  it('manual: vale hasta su vencimiento y después queda Descansando', () => {
    expect(effectiveAttentionStatus(base, MONDAY_10AM)).toBe(AttentionStatus.AVAILABLE);
    const expired = { ...base, attentionStatusUntil: new Date('2026-11-02T12:00:00Z') };
    expect(effectiveAttentionStatus(expired, MONDAY_10AM)).toBe(AttentionStatus.RESTING);
  });

  it('automático: franja, fuera de franja, día sin atención y excepción manual', () => {
    const auto = {
      ...base,
      attentionStatus: AttentionStatus.WORKING,
      autoStatusFromSchedule: true,
      slots: [{ weekday: 1, startTime: '08:00:00', endTime: '12:00:00' }],
    };
    expect(effectiveAttentionStatus(auto, MONDAY_10AM)).toBe(AttentionStatus.AVAILABLE);
    expect(effectiveAttentionStatus(auto, new Date('2026-11-02T16:00:00Z'))).toBe(
      AttentionStatus.RESTING,
    );
    const holiday = { ...auto, exceptions: [{ startDate: '2026-11-01', endDate: '2026-11-02' }] };
    expect(effectiveAttentionStatus(holiday, MONDAY_10AM)).toBe(AttentionStatus.RESTING);
    const override = { ...auto, attentionStatusUntil: new Date('2026-11-02T20:00:00Z') };
    expect(effectiveAttentionStatus(override, MONDAY_10AM)).toBe(AttentionStatus.WORKING);
  });
});

describe('slug del perfil', () => {
  it('saca tildes y signos y agrega un sufijo aleatorio', () => {
    expect(slugBase('José María', 'Núñez-Pérez')).toBe('jose-maria-nunez-perez');
    expect(slugBase('!!!')).toBe('profesional');
    const slug = profileSlug('Ana', 'Gómez');
    expect(slug).toMatch(/^ana-gomez-[a-z0-9]{5}$/);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('redes sociales', () => {
  it('exige https y el dominio de la red', () => {
    expect(normalizeSocialUrl(SocialNetwork.INSTAGRAM, 'https://www.instagram.com/juan#x')).toBe(
      'https://www.instagram.com/juan',
    );
    expect(normalizeSocialUrl(SocialNetwork.INSTAGRAM, 'http://instagram.com/juan')).toBeNull();
    expect(
      normalizeSocialUrl(SocialNetwork.INSTAGRAM, 'https://instagram.com.evil.io/x'),
    ).toBeNull();
    expect(
      normalizeSocialUrl(SocialNetwork.FACEBOOK, 'https://user:pass@facebook.com/x'),
    ).toBeNull();
    expect(normalizeSocialUrl(SocialNetwork.YOUTUBE, 'https://youtu.be/abc')).not.toBeNull();
    expect(
      normalizeSocialUrl(SocialNetwork.WEBSITE, 'https://plomeria-juan.com.ar'),
    ).not.toBeNull();
    expect(normalizeSocialUrl(SocialNetwork.WEBSITE, 'javascript:alert(1)')).toBeNull();
  });
});

describe('personalización por plan', () => {
  it('Basic no admite nada; Medium sin animación; Premium todo', () => {
    const theme = { color: 'azul' as const, animation: 'zoom' as const };
    expect(themeFieldsNotAllowed(theme, ThemeLevel.NONE)).toEqual(['color', 'animation']);
    expect(themeFieldsNotAllowed(theme, ThemeLevel.STANDARD)).toEqual(['animation']);
    expect(themeFieldsNotAllowed(theme, ThemeLevel.EXTENDED)).toEqual([]);
    expect(themeFieldsNotAllowed({}, ThemeLevel.NONE)).toEqual([]);
  });

  it('secciones (ADR 0034): Medium solo fondo y letra; Premium también degradé, tamaño y animación', () => {
    const theme = {
      sections: {
        sobre: { background: '#123b7a', text: '#ffffff' },
        contacto: { background: '#0b1f3a', backgroundTo: '#3b82f6', size: 110 as const, animation: 'rebote' as const },
      },
    };
    expect(themeFieldsNotAllowed(theme, ThemeLevel.NONE)).toEqual(['sections']);
    expect(themeFieldsNotAllowed(theme, ThemeLevel.STANDARD)).toEqual([
      'sections.contacto.backgroundTo',
      'sections.contacto.size',
      'sections.contacto.animation',
    ]);
    expect(themeFieldsNotAllowed(theme, ThemeLevel.EXTENDED)).toEqual([]);
  });

  it('al bajar de plan se oculta lo que no incluye, sin dejar secciones vacías', () => {
    const theme = {
      color: 'azul' as const,
      animation: 'zoom' as const,
      sections: {
        sobre: { background: '#123b7a', backgroundTo: '#3b82f6', text: '#ffffff' },
        resenas: { animation: 'girar' as const },
      },
    };
    expect(themeForPlan(theme, ThemeLevel.STANDARD)).toEqual({
      color: 'azul',
      sections: { sobre: { background: '#123b7a', text: '#ffffff' } },
    });
    expect(themeForPlan(theme, ThemeLevel.NONE)).toEqual({});
    expect(themeForPlan(theme, ThemeLevel.EXTENDED)).toEqual(theme);
    // Un degradé sin color de inicio no se muestra.
    expect(themeForPlan({ sections: { datos: { backgroundTo: '#000000' } } }, ThemeLevel.EXTENDED)).toEqual({});
  });
});

describe('prueba de 30 días', () => {
  it('cuenta los días hacia arriba y elige el recordatorio que corresponde', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(daysUntil(new Date('2026-12-02T12:00:00Z'), now)).toBe(30);
    expect(daysUntil(new Date('2026-11-02T13:00:00Z'), now)).toBe(1);
    expect(daysUntil(new Date('2026-11-01T12:00:00Z'), now)).toBe(0);
    expect(trialReminderFor(30)).toBeNull();
    expect(trialReminderFor(7)).toBe(7);
    expect(trialReminderFor(5)).toBe(7);
    expect(trialReminderFor(3)).toBe(3);
    expect(trialReminderFor(1)).toBe(1);
  });
});
