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

/**
 * Estilo por sección de la página (ADR 0034, pedido del fundador el 10/11/2026). Los colores son libres
 * pero SOLO en formato `#rrggbb` (validado con expresión regular): el frontend los pone en atributos
 * `style` de React, que los escapa; nunca se arma CSS con texto del usuario. Tamaño y animación son de
 * listas cerradas.
 */
export const THEME_SECTIONS = [
  'pagina',
  'presentacion',
  'datos',
  'sobre',
  'trabajos',
  'certificados',
  'resenas',
  'contacto',
  'zonas',
  'horarios',
  'redes',
] as const;
export const SECTION_ANIMATIONS = [
  'aparecer',
  'subir',
  'costado',
  'zoom',
  'rebote',
  'girar',
] as const;
/** Escala del contenido de la sección, en por ciento. */
export const SECTION_SIZES = [85, 90, 95, 100, 105, 110, 115, 120, 125] as const;
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

export type ThemeSection = (typeof THEME_SECTIONS)[number];

export interface SectionStyle {
  /** Color de fondo. */
  background?: string;
  /** Segundo color: el fondo pasa a ser un degradé (solo Premium). */
  backgroundTo?: string;
  /** Color de letra. */
  text?: string;
  /** Solo Premium. */
  size?: (typeof SECTION_SIZES)[number];
  /** Solo Premium: cómo entra la sección al aparecer en pantalla. */
  animation?: (typeof SECTION_ANIMATIONS)[number];
}

export interface ProfileTheme {
  color?: ThemeColor;
  /** Degradé entre dos colores de la lista. */
  gradient?: { from: ThemeColor; to: ThemeColor };
  font?: (typeof THEME_FONTS)[number];
  /** Texto destacado de la página. */
  headline?: string;
  /** Solo Premium (EXTENDED). */
  animation?: (typeof THEME_ANIMATIONS)[number];
  /** Medium y Premium, cada uno con sus campos (SECTION_FIELDS_BY_LEVEL). */
  sections?: Partial<Record<ThemeSection, SectionStyle>>;
}

/** Qué campos admite cada nivel del plan. */
const FIELDS_BY_LEVEL: Record<ThemeLevel, ReadonlyArray<keyof ProfileTheme>> = {
  [ThemeLevel.NONE]: [],
  [ThemeLevel.STANDARD]: ['color', 'gradient', 'font', 'headline', 'sections'],
  [ThemeLevel.EXTENDED]: ['color', 'gradient', 'font', 'headline', 'animation', 'sections'],
};

/** Medium: colores sólidos de fondo y de letra. Premium: además degradé, tamaño y animación. */
const SECTION_FIELDS_BY_LEVEL: Record<ThemeLevel, ReadonlyArray<keyof SectionStyle>> = {
  [ThemeLevel.NONE]: [],
  [ThemeLevel.STANDARD]: ['background', 'text'],
  [ThemeLevel.EXTENDED]: ['background', 'backgroundTo', 'text', 'size', 'animation'],
};

const present = (value: unknown) => value !== undefined && value !== null;

/**
 * Campos del tema que el plan no permite (vacío si todo está permitido). Los de las secciones van con
 * su ruta: `sections.sobre.animation`.
 */
export function themeFieldsNotAllowed(theme: ProfileTheme, level: ThemeLevel): string[] {
  const allowed = new Set<string>(FIELDS_BY_LEVEL[level]);
  const top = Object.entries(theme)
    .filter(([, value]) => present(value))
    .map(([key]) => key)
    .filter((key) => !allowed.has(key));
  if (!allowed.has('sections') || !theme.sections) return top;
  const sectionFields = new Set<string>(SECTION_FIELDS_BY_LEVEL[level]);
  const nested = Object.entries(theme.sections).flatMap(([section, style]) =>
    Object.entries(style ?? {})
      .filter(([field, value]) => present(value) && !sectionFields.has(field))
      .map(([field]) => `sections.${section}.${field}`),
  );
  return [...top, ...nested];
}

/**
 * El tema tal como se muestra con el plan vigente: lo que el plan no incluye se oculta (no se borra:
 * si vuelve a subir de plan, reaparece). Si solo queda `backgroundTo` sin `background`, no hay degradé.
 */
export function themeForPlan(theme: ProfileTheme, level: ThemeLevel): ProfileTheme {
  const allowed = new Set<string>(FIELDS_BY_LEVEL[level]);
  const visible = Object.fromEntries(
    Object.entries(theme).filter(([key, value]) => present(value) && allowed.has(key)),
  ) as ProfileTheme;
  if (!visible.sections) return visible;
  const sectionFields = new Set<string>(SECTION_FIELDS_BY_LEVEL[level]);
  const sections = Object.fromEntries(
    Object.entries(visible.sections)
      .map(([section, style]) => {
        const kept = Object.fromEntries(
          Object.entries(style ?? {}).filter(
            ([field, value]) => present(value) && sectionFields.has(field),
          ),
        ) as SectionStyle;
        if (kept.backgroundTo && !kept.background) delete kept.backgroundTo;
        return [section, kept] as const;
      })
      .filter(([, style]) => Object.keys(style).length > 0),
  );
  const result: ProfileTheme = { ...visible, sections };
  if (Object.keys(sections).length === 0) delete result.sections;
  return result;
}
