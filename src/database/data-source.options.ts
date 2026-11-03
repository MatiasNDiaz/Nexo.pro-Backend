import type { DataSourceOptions } from 'typeorm';
import { AdminAuditLog } from '../audit/entities/admin-audit-log.entity';
import { AuthIdentity, OAuthPendingRequest } from '../auth/entities/auth-identity.entity';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { Conversation, Message, MessageAttachment } from '../chat/entities/chat.entities';
import { Notification } from '../notifications/entities/notification.entity';
import {
  Quote,
  ServiceContract,
  ServiceContractHistory,
  ServiceRequest,
  ServiceRequestTarget,
} from '../requests/entities/requests.entities';
import { OneTimeToken } from '../auth/entities/one-time-token.entity';
import { UserMfaSettings } from '../auth/entities/user-mfa-settings.entity';
import {
  AvailabilityException,
  AvailabilitySlot,
} from '../professionals/entities/availability.entity';
import { ProfessionalCertification } from '../professionals/entities/professional-certification.entity';
import { ProfessionalMedia } from '../professionals/entities/professional-media.entity';
import { ProfessionalProfession } from '../professionals/entities/professional-profession.entity';
import { ProfessionalSocialLink } from '../professionals/entities/professional-social-link.entity';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { ProfessionalServiceArea } from '../professionals/entities/professional-service-area.entity';
import { IdentityProviderEvent } from '../identity-verification/entities/identity-provider-event.entity';
import { IdentityVerification } from '../identity-verification/entities/identity-verification.entity';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { User } from '../users/entities/user.entity';
import { Locality } from '../locations/entities/locality.entity';
import { Neighborhood } from '../locations/entities/neighborhood.entity';
import { Province } from '../locations/entities/province.entity';
import { Profession } from '../professions/entities/profession.entity';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import { Subscription, SubscriptionHistory } from '../subscriptions/entities/subscription.entity';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { MIGRATIONS } from './migrations';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Todas las entidades, en un solo lugar (sin globs: funciona igual en Jest, CLI y producción). */
export const ENTITIES = [
  AdminAuditLog,
  Province,
  Locality,
  Neighborhood,
  Profession,
  SubscriptionPlan,
  User,
  AuthSession,
  OneTimeToken,
  UserMfaSettings,
  ProfessionalProfile,
  ProfessionalProfession,
  ProfessionalServiceArea,
  StoredFile,
  IdentityVerification,
  IdentityProviderEvent,
  CustomerProfile,
  ProfessionalMedia,
  ProfessionalCertification,
  ProfessionalSocialLink,
  AvailabilitySlot,
  AvailabilityException,
  Subscription,
  SubscriptionHistory,
  AuthIdentity,
  OAuthPendingRequest,
  Conversation,
  Message,
  MessageAttachment,
  ServiceRequest,
  ServiceRequestTarget,
  Quote,
  ServiceContract,
  ServiceContractHistory,
  Notification,
];

export interface ConnectionSettings {
  url: string;
  ssl: boolean;
  poolMax: number;
}

/** Opciones compartidas por la app, la CLI de migraciones y los tests. */
export function buildDataSourceOptions(connection: ConnectionSettings): DataSourceOptions {
  return {
    type: 'postgres',
    url: connection.url,
    ssl: connection.ssl ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    namingStrategy: new SnakeNamingStrategy(),
    // El esquema cambia SOLO con migraciones revisadas a mano, en todos los ambientes.
    synchronize: false,
    migrationsRun: false,
    // El logger de TypeORM imprime los parámetros de las queries fallidas (datos personales).
    logging: false,
    // Default de los UUID: gen_random_uuid() (nativo). Las extensiones las crean las migraciones:
    // el usuario de runtime no tiene permisos para hacerlo.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    extra: { max: connection.poolMax, application_name: 'nexo-pro-api' },
  };
}
