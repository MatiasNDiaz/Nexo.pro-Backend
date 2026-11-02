import { existsSync } from 'fs';

/**
 * Carga `.env.<NODE_ENV>.local` y `.env.<NODE_ENV>` en process.env para los procesos que corren
 * fuera de Nest (CLI de migraciones, seeds, setup de tests). Mismo orden que el ConfigModule:
 * las variables ya definidas no se pisan, y `.local` gana sobre el archivo versionado.
 */
export function loadEnvFiles(nodeEnv = process.env.NODE_ENV ?? 'development'): void {
  for (const file of [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
