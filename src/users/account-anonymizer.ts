import { EntityManager } from 'typeorm';
import { AuthIdentity, OAuthPendingRequest } from '../auth/entities/auth-identity.entity';
import { AuthSession, SessionRevokeReason } from '../auth/entities/auth-session.entity';
import { OneTimeToken } from '../auth/entities/one-time-token.entity';
import { UserMfaSettings } from '../auth/entities/user-mfa-settings.entity';
import {
  AvailabilityException,
  AvailabilitySlot,
} from '../professionals/entities/availability.entity';
import { ProfessionalCertification } from '../professionals/entities/professional-certification.entity';
import { ProfessionalMedia } from '../professionals/entities/professional-media.entity';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { ProfessionalSocialLink } from '../professionals/entities/professional-social-link.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from './entities/user.entity';
import { AccountStatus } from './user.enums';

/**
 * Anonimización definitiva (ADR 0013 y 0016): borra los datos personales y deja una cuenta
 * inutilizable. Se conservan el id (seudónimo) y lo que lo referencia (auditoría y, más adelante,
 * pagos, reportes e historial). La comparten la API y el comando `accounts:purge`; corre en la
 * transacción del llamador.
 */
export async function anonymizeAccount(manager: EntityManager, userId: string): Promise<void> {
  const now = new Date();
  await manager.getRepository(User).update(userId, {
    email: `deleted-${userId}@deleted.invalid`,
    firstName: 'Cuenta',
    lastName: 'eliminada',
    phone: '',
    // Hash imposible de satisfacer: ninguna contraseña lo verifica.
    passwordHash: '!',
    neighborhoodId: null,
    status: AccountStatus.DEACTIVATED,
    statusReason: null,
    emailVerifiedAt: null,
    lockedUntil: null,
    deletionScheduledFor: null,
    deletedAt: now,
  });
  await manager.getRepository(UserMfaSettings).delete({ userId });
  await manager.getRepository(OneTimeToken).delete({ userId });
  // La vinculación con Google identifica a la persona (ADR 0015).
  await manager.getRepository(AuthIdentity).delete({ userId });
  await manager.getRepository(OAuthPendingRequest).delete({ userId });
  await manager
    .createQueryBuilder()
    .update(ProfessionalProfile)
    .set({ deactivatedAt: now })
    .where('user_id = :userId AND deactivated_at IS NULL', { userId })
    .execute();
  await anonymizeProfiles(manager, userId);
  await manager
    .createQueryBuilder()
    .update(AuthSession)
    .set({ revokedAt: now, revokeReason: SessionRevokeReason.ACCOUNT_DELETED })
    .where('user_id = :userId AND revoked_at IS NULL', { userId })
    .execute();
}

/** Cuentas cuya gracia venció: hay que anonimizarlas. */
export async function accountsDueForAnonymization(
  manager: EntityManager,
  now = new Date(),
): Promise<string[]> {
  const rows = await manager
    .getRepository(User)
    .createQueryBuilder('u')
    .select('u.id', 'id')
    .where('u.status = :status AND u.deletionScheduledFor <= :now', {
      status: AccountStatus.DEACTIVATED,
      now,
    })
    .getRawMany<{ id: string }>();
  return rows.map((row) => row.id);
}

/**
 * Perfiles: se borra lo que la persona escribió o subió (descripción, nombre comercial, medios,
 * certificados, redes, horarios, datos del cliente). Los archivos ya los marcó `detachAllFrom`.
 * Se conservan las profesiones y zonas (no son datos personales) y el slug pasa a ser anónimo.
 */
async function anonymizeProfiles(manager: EntityManager, userId: string): Promise<void> {
  await manager.getRepository(CustomerProfile).delete({ userId });
  const profile = await manager.getRepository(ProfessionalProfile).findOneBy({ userId });
  if (!profile) return;
  const professionalId = profile.id;
  await manager.getRepository(ProfessionalMedia).delete({ professionalId });
  await manager.getRepository(ProfessionalCertification).delete({ professionalId });
  await manager.getRepository(ProfessionalSocialLink).delete({ professionalId });
  await manager.getRepository(AvailabilitySlot).delete({ professionalId });
  await manager.getRepository(AvailabilityException).delete({ professionalId });
  await manager.getRepository(ProfessionalProfile).update(professionalId, {
    slug: `eliminado-${professionalId.replace(/-/g, '').slice(0, 16)}`,
    businessName: null,
    bio: null,
    yearsExperience: null,
    referenceRate: null,
    rateMode: null,
    theme: {},
  });
}
