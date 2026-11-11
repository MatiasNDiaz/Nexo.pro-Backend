import type { DataSource } from 'typeorm';

/**
 * Quién aparece en el catálogo (se calcula en cada consulta, sin columna `is_listed`): cuenta activa,
 * identidad aprobada (o aprobada con foto o nombre en revisión, ADR 0019 y 0021), prueba o plan
 * vigente, perfil activo y completo (foto, descripción, una profesión y una zona), y sin la
 * sanción "perfil oculto" vigente (C-29, ADR 0029).
 *
 * Usa los alias `p` (professional_profiles) y `u` (users). Es la única regla: el catálogo, la página
 * pública, el panel del admin y la vista previa del profesional (`publicationChecklist`) la comparten.
 */
export const VISIBLE = `
  p.deactivated_at IS NULL
  AND u.role = 'PROFESSIONAL' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
  AND (u.verification_status = 'APPROVED'
       OR (u.verification_status = 'REQUIRES_REVIEW'
           AND (u.pending_avatar_file_id IS NOT NULL OR u.pending_first_name IS NOT NULL)))
  AND u.avatar_file_id IS NOT NULL AND p.bio IS NOT NULL
  AND EXISTS (SELECT 1 FROM professional_professions pp
               WHERE pp.professional_id = p.id AND pp.status = 'ACTIVE')
  AND EXISTS (SELECT 1 FROM professional_service_areas a WHERE a.professional_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM sanctions sa
                   WHERE sa.user_id = u.id AND sa.type = 'PROFILE_HIDDEN' AND sa.lifted_at IS NULL
                     AND (sa.ends_at IS NULL OR sa.ends_at > now()))`;

/**
 * Suscripción vigente (la prueba de 30 días cuenta, decisión del fundador del 2026-11-11): una prueba o
 * un período vencidos que la tarea todavía no marcó no cuentan. Alias `s` y `sp`.
 */
export const LIVE_SUBSCRIPTION = `
  JOIN subscriptions s ON s.user_id = u.id
   AND s.status IN ('TRIAL', 'ACTIVE')
   AND (s.status <> 'TRIAL' OR s.trial_ends_at > now())
   AND (s.status <> 'ACTIVE' OR s.current_period_end > now())
  JOIN subscription_plans sp ON sp.id = s.plan_id`;

/** ¿El usuario `u` (alias del llamador) tiene su página publicada? Para usar dentro de un WHERE. */
export const PUBLISHED_EXISTS = `EXISTS (
  SELECT 1 FROM professional_profiles p
  ${LIVE_SUBSCRIPTION}
  WHERE p.user_id = u.id AND ${VISIBLE})`;

/** Lo que le falta a una página para ser pública, en el orden en que conviene resolverlo. */
export enum PublicationRequirement {
  /** Cuenta sin activar (falta confirmar el email). */
  ACCOUNT_NOT_ACTIVE = 'ACCOUNT_NOT_ACTIVE',
  /** Cuenta suspendida, bloqueada o dada de baja. */
  ACCOUNT_RESTRICTED = 'ACCOUNT_RESTRICTED',
  IDENTITY_NOT_VERIFIED = 'IDENTITY_NOT_VERIFIED',
  NO_AVATAR = 'NO_AVATAR',
  NO_BIO = 'NO_BIO',
  NO_PROFESSION = 'NO_PROFESSION',
  NO_SERVICE_AREA = 'NO_SERVICE_AREA',
  /** Sin prueba ni plan vigente. */
  NO_LIVE_PLAN = 'NO_LIVE_PLAN',
  /** El perfil está pausado por el propio profesional. */
  PROFILE_DEACTIVATED = 'PROFILE_DEACTIVATED',
  /** Sanción "perfil oculto" vigente. */
  PROFILE_HIDDEN = 'PROFILE_HIDDEN',
}

interface ChecklistRow {
  status: string;
  verification_status: string;
  identity_ok: boolean;
  has_avatar: boolean;
  has_bio: boolean;
  has_profession: boolean;
  has_area: boolean;
  has_plan: boolean;
  deactivated: boolean;
  hidden: boolean;
}

/**
 * Qué le falta a la página de un profesional para ser pública, condición por condición (las mismas
 * de `VISIBLE` y `LIVE_SUBSCRIPTION`). Lista vacía = publicada. `null` si no tiene perfil profesional.
 */
export async function publicationChecklist(
  dataSource: DataSource,
  userId: string,
): Promise<PublicationRequirement[] | null> {
  const [row] = await dataSource.query<ChecklistRow[]>(
    `SELECT u.status::text AS status, u.verification_status::text AS verification_status,
            (u.verification_status = 'APPROVED'
              OR (u.verification_status = 'REQUIRES_REVIEW'
                  AND (u.pending_avatar_file_id IS NOT NULL OR u.pending_first_name IS NOT NULL)))
              AS identity_ok,
            u.avatar_file_id IS NOT NULL AS has_avatar,
            p.bio IS NOT NULL AS has_bio,
            EXISTS (SELECT 1 FROM professional_professions pp
                     WHERE pp.professional_id = p.id AND pp.status = 'ACTIVE') AS has_profession,
            EXISTS (SELECT 1 FROM professional_service_areas a
                     WHERE a.professional_id = p.id) AS has_area,
            EXISTS (SELECT 1 FROM subscriptions s
                     WHERE s.user_id = u.id AND s.status IN ('TRIAL', 'ACTIVE')
                       AND (s.status <> 'TRIAL' OR s.trial_ends_at > now())
                       AND (s.status <> 'ACTIVE' OR s.current_period_end > now())) AS has_plan,
            p.deactivated_at IS NOT NULL AS deactivated,
            EXISTS (SELECT 1 FROM sanctions sa
                     WHERE sa.user_id = u.id AND sa.type = 'PROFILE_HIDDEN' AND sa.lifted_at IS NULL
                       AND (sa.ends_at IS NULL OR sa.ends_at > now())) AS hidden
       FROM professional_profiles p
       JOIN users u ON u.id = p.user_id
      WHERE u.id = $1 AND u.role = 'PROFESSIONAL'`,
    [userId],
  );
  if (!row) return null;
  const missing: PublicationRequirement[] = [];
  if (row.status === 'PENDING_VERIFICATION')
    missing.push(PublicationRequirement.ACCOUNT_NOT_ACTIVE);
  else if (row.status !== 'ACTIVE') missing.push(PublicationRequirement.ACCOUNT_RESTRICTED);
  if (!row.identity_ok) missing.push(PublicationRequirement.IDENTITY_NOT_VERIFIED);
  if (!row.has_avatar) missing.push(PublicationRequirement.NO_AVATAR);
  if (!row.has_bio) missing.push(PublicationRequirement.NO_BIO);
  if (!row.has_profession) missing.push(PublicationRequirement.NO_PROFESSION);
  if (!row.has_area) missing.push(PublicationRequirement.NO_SERVICE_AREA);
  if (!row.has_plan) missing.push(PublicationRequirement.NO_LIVE_PLAN);
  if (row.deactivated) missing.push(PublicationRequirement.PROFILE_DEACTIVATED);
  if (row.hidden) missing.push(PublicationRequirement.PROFILE_HIDDEN);
  return missing;
}
