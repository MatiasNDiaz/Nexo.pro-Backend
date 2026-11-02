import { ThemeLevel } from '../subscriptions/entities/subscription-plan.entity';

/**
 * Personalización de la página del profesional (FI §6.3, aprobada el 02/11/2026): SOLO valores de
 * listas cerradas, nunca CSS ni HTML del usuario. Los valores son nombres; el frontend define el
 * color o la tipografía real de cada uno.
 */
export const THEME_COLORS = [
  'azul',
  'celeste',
  'turquesa',
  'verde',
  'lima',
  'amarillo',
  'naranja',
  'rojo',
  'rosa',
  'violeta',
  'gris',
  'grafito',
] as const;
export const THEME_FONTS = ['moderna', 'clasica', 'redondeada', 'manuscrita'] as const;
export const THEME_ANIMATIONS = ['aparecer', 'deslizar', 'zoom', 'rebote'] as const;
export const THEME_HEADLINE_MAX = 80;

export type ThemeColor = (typeof THEME_COLORS)[number];

export interface ProfileTheme {
  color?: ThemeColor;
  /** Degradé entre dos colores de la lista. */
  gradient?: { from: ThemeColor; to: ThemeColor };
  font?: (typeof THEME_FONTS)[number];
  /** Texto destacado de la página. */
  headline?: string;
  /** Solo Premium (EXTENDED). */
  animation?: (typeof THEME_ANIMATIONS)[number];
}

/** Qué campos admite cada nivel del plan. */
const FIELDS_BY_LEVEL: Record<ThemeLevel, ReadonlyArray<keyof ProfileTheme>> = {
  [ThemeLevel.NONE]: [],
  [ThemeLevel.STANDARD]: ['color', 'gradient', 'font', 'headline'],
  [ThemeLevel.EXTENDED]: ['color', 'gradient', 'font', 'headline', 'animation'],
};

/** Campos del tema que el plan no permite (vacío si todo está permitido). */
export function themeFieldsNotAllowed(theme: ProfileTheme, level: ThemeLevel): string[] {
  const allowed = new Set<string>(FIELDS_BY_LEVEL[level]);
  return Object.entries(theme)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key]) => key)
    .filter((key) => !allowed.has(key));
}
