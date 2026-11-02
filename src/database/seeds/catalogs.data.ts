import { ThemeLevel } from '../../subscriptions/entities/subscription-plan.entity';

/**
 * Datos iniciales de los catálogos maestros. El seed solo inserta lo que falta: nunca pisa lo que
 * el admin haya cambiado. Todo lo marcado como provisorio está en docs/decisions/pendientes.md.
 */

/**
 * Provincias y localidades. Los barrios NO se siembran: los crean los usuarios y los modera el
 * admin (ADR 0010). La lista completa de localidades y sus coordenadas queda pendiente.
 */
export const LOCATIONS_SEED = [{ province: 'Córdoba', localities: ['Córdoba'] }];

/** Oficios de EJEMPLO; el catálogo definitivo lo administra el admin (FI §7.1). */
export const PROFESSIONS_SEED = [
  { name: 'Plomero', slug: 'plomero' },
  { name: 'Electricista', slug: 'electricista' },
  { name: 'Gasista', slug: 'gasista' },
  { name: 'Carpintero', slug: 'carpintero' },
  { name: 'Cerrajero', slug: 'cerrajero' },
  { name: 'Pintor', slug: 'pintor' },
  { name: 'Albañil', slug: 'albanil' },
  { name: 'Herrero', slug: 'herrero' },
  { name: 'Técnico en refrigeración', slug: 'tecnico-en-refrigeracion' },
  { name: 'Jardinero', slug: 'jardinero' },
];

const MB = 1024 * 1024;

/**
 * Planes (FI §6.1 y §6.3). Precios de referencia en ARS con impuestos incluidos, a confirmar antes
 * de producción. Premium: 5 imágenes y 2 videos (confirmado por el fundador el 02/11/2026).
 * Medium sin métricas: "no confirmado" en FI §6.3. Pesos por archivo aprobados el 02/11/2026 (ADR 0018).
 */
export const SUBSCRIPTION_PLANS_SEED = [
  {
    code: 'BASIC',
    name: 'Basic',
    priceAmount: '10000.00',
    maxProfessions: 1,
    maxImages: 5,
    maxVideos: 0,
    maxVideoSeconds: 15,
    themeLevel: ThemeLevel.NONE,
    rankingTier: 0,
    availabilityAlerts: false,
    customAlertMessage: false,
    metricsEnabled: false,
    chatbotEnabled: false,
    maxImageBytes: 5 * MB,
    maxVideoBytes: 30 * MB,
  },
  {
    code: 'MEDIUM',
    name: 'Medium',
    priceAmount: '15000.00',
    maxProfessions: 2,
    maxImages: 5,
    maxVideos: 1,
    maxVideoSeconds: 15,
    themeLevel: ThemeLevel.STANDARD,
    rankingTier: 1,
    availabilityAlerts: true,
    customAlertMessage: false,
    metricsEnabled: false,
    chatbotEnabled: false,
    maxImageBytes: 5 * MB,
    maxVideoBytes: 30 * MB,
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    priceAmount: '20000.00',
    maxProfessions: 3,
    maxImages: 5,
    maxVideos: 2,
    maxVideoSeconds: 15,
    themeLevel: ThemeLevel.EXTENDED,
    rankingTier: 2,
    availabilityAlerts: true,
    customAlertMessage: true,
    metricsEnabled: true,
    chatbotEnabled: true,
    maxImageBytes: 10 * MB,
    maxVideoBytes: 50 * MB,
  },
];
