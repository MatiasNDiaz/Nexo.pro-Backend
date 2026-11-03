import { InitDatabase1793640000000 } from './1793640000000-InitDatabase';
import { CreateAdminAuditLogs1793640001000 } from './1793640001000-CreateAdminAuditLogs';
import { CreateLocations1793640002000 } from './1793640002000-CreateLocations';
import { CreateProfessions1793640003000 } from './1793640003000-CreateProfessions';
import { CreateSubscriptionPlans1793640004000 } from './1793640004000-CreateSubscriptionPlans';
import { CreateUsers1793640005000 } from './1793640005000-CreateUsers';
import { UserCreatedNeighborhoods1793640006000 } from './1793640006000-UserCreatedNeighborhoods';
import { CreateAuthTables1793640007000 } from './1793640007000-CreateAuthTables';
import { CreateProfessionalProfiles1793640008000 } from './1793640008000-CreateProfessionalProfiles';
import { AccountLifecycle1793640009000 } from './1793640009000-AccountLifecycle';
import { AccountDeletionGracePeriod1793640010000 } from './1793640010000-AccountDeletionGracePeriod';
import { CreateStoredFiles1793640011000 } from './1793640011000-CreateStoredFiles';
import { CreateIdentityVerification1793640012000 } from './1793640012000-CreateIdentityVerification';
import { ProfilesMediaAvailability1793640013000 } from './1793640013000-ProfilesMediaAvailability';
import { CreateSubscriptions1793640014000 } from './1793640014000-CreateSubscriptions';
import { PendingNameChange1793640015000 } from './1793640015000-PendingNameChange';
import { GoogleLogin1793640016000 } from './1793640016000-GoogleLogin';
import { ChatRequestsContracts1793640017000 } from './1793640017000-ChatRequestsContracts';
import { Payments1793640018000 } from './1793640018000-Payments';
import { ReviewsFavoritesForum1793640019000 } from './1793640019000-ReviewsFavoritesForum';
import { Moderation1793640020000 } from './1793640020000-Moderation';
import { Hardening1793640021000 } from './1793640021000-Hardening';
import { RevenuePanel1793640022000 } from './1793640022000-RevenuePanel';
import { NewDeviceAlert1793640023000 } from './1793640023000-NewDeviceAlert';

/**
 * Lista explícita (en orden) de migraciones. Se registran a mano en vez de con un glob para que
 * funcionen igual en Jest, en la CLI y en la imagen de producción. Un test verifica que ningún
 * archivo de esta carpeta quede afuera.
 */
export const MIGRATIONS = [
  InitDatabase1793640000000,
  CreateAdminAuditLogs1793640001000,
  CreateLocations1793640002000,
  CreateProfessions1793640003000,
  CreateSubscriptionPlans1793640004000,
  CreateUsers1793640005000,
  UserCreatedNeighborhoods1793640006000,
  CreateAuthTables1793640007000,
  CreateProfessionalProfiles1793640008000,
  AccountLifecycle1793640009000,
  AccountDeletionGracePeriod1793640010000,
  CreateStoredFiles1793640011000,
  CreateIdentityVerification1793640012000,
  ProfilesMediaAvailability1793640013000,
  CreateSubscriptions1793640014000,
  PendingNameChange1793640015000,
  GoogleLogin1793640016000,
  ChatRequestsContracts1793640017000,
  Payments1793640018000,
  ReviewsFavoritesForum1793640019000,
  Moderation1793640020000,
  Hardening1793640021000,
  RevenuePanel1793640022000,
  NewDeviceAlert1793640023000,
];
