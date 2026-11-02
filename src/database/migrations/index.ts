import { InitDatabase1793640000000 } from './1793640000000-InitDatabase';
import { CreateAdminAuditLogs1793640001000 } from './1793640001000-CreateAdminAuditLogs';
import { CreateLocations1793640002000 } from './1793640002000-CreateLocations';
import { CreateProfessions1793640003000 } from './1793640003000-CreateProfessions';
import { CreateSubscriptionPlans1793640004000 } from './1793640004000-CreateSubscriptionPlans';

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
];
