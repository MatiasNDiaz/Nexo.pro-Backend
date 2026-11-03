import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 13.2 (ADR 0031): hash de la cookie de dispositivo en cada sesión, para avisar por email
 * cuando una cuenta inicia sesión desde un dispositivo que no usó antes. Las sesiones existentes
 * quedan sin hash: el próximo inicio de sesión de cada dispositivo cuenta como nuevo.
 */
export class NewDeviceAlert1793640023000 implements MigrationInterface {
  name = 'NewDeviceAlert1793640023000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE auth_sessions ADD COLUMN device_hash char(64)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE auth_sessions DROP COLUMN device_hash`);
  }
}
