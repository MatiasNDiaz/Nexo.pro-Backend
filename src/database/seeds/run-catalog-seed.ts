import dataSource from '../data-source';
import { seedCatalogs } from './seed-catalogs';

/**
 * CLI: `npm run seed:catalogs`. En producción exige `--allow-production`, porque las ubicaciones y
 * los oficios cargados son de ejemplo (ver docs/decisions/pendientes.md).
 */
async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.argv.includes('--allow-production')) {
    throw new Error(
      'En producción el seed requiere --allow-production (los datos son de ejemplo).',
    );
  }
  await dataSource.initialize();
  try {
    const inserted = await seedCatalogs(dataSource);
    process.stdout.write(`Catálogos sembrados. Filas nuevas: ${JSON.stringify(inserted)}\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed fallido: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
