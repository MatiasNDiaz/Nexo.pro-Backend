import { resetTestDatabase } from './test-database';

/** Jest globalSetup (integración y e2e): base de test limpia, migrada y con catálogos. */
export default async function globalSetup(): Promise<void> {
  await resetTestDatabase();
}
