import { parseArgs } from 'util';
import { encryptField } from '../../common/crypto/crypto.utils';
import { validateEnv } from '../../config/env.validation';
import dataSource from '../../database/data-source';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/user.enums';
import { UserMfaSettings } from '../entities/user-mfa-settings.entity';
import { createMfaEnrollment } from '../mfa-secrets';

/**
 * `npm run admin:reset-mfa -- --email … --confirm` (en producción:
 * `node dist/auth/cli/reset-admin-mfa.js --email … --confirm` desde la consola del servidor).
 *
 * Recupera el segundo factor del admin si se perdieron el dispositivo y los códigos (C-34): genera
 * un secreto TOTP y códigos de recuperación nuevos, invalida los anteriores, cierra todas las
 * sesiones del admin y lo audita. Solo lo puede correr quien tiene acceso a la consola del
 * servidor (Railway) y a sus variables. Los datos nuevos se muestran UNA sola vez.
 */

const write = (text: string) => process.stdout.write(`${text}\n`);

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const { values } = parseArgs({
    options: { email: { type: 'string' }, confirm: { type: 'boolean', default: false } },
  });
  const email = values.email?.toLowerCase();
  if (!email) throw new Error('Falta --email (el del admin).');
  if (!values.confirm) {
    throw new Error(
      'Agregá --confirm: invalida el 2FA y los códigos actuales y cierra todas las sesiones del admin.',
    );
  }
  const enrollment = createMfaEnrollment(email);
  const encryptionKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      const admin = await manager
        .getRepository(User)
        .findOne({ where: { email, role: UserRole.ADMIN }, lock: { mode: 'pessimistic_write' } });
      if (!admin) throw new Error('No hay un admin con ese email.');
      await manager.getRepository(UserMfaSettings).update(admin.id, {
        totpSecretEncrypted: encryptField(
          enrollment.secret,
          encryptionKey,
          env.DATA_ENCRYPTION_KEY_VERSION,
        ),
        recoveryCodeHashes: enrollment.recoveryCodeHashes,
        enabledAt: new Date(),
      });
      // Desbloqueo por si quedó bloqueado por intentos fallidos con el código viejo.
      await manager
        .getRepository(User)
        .update(admin.id, { failedLoginAttempts: 0, lockedUntil: null });
      await manager.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'ADMIN_REVOKED'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [admin.id],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, metadata, result)
         VALUES (NULL, 'ADMIN_MFA_RESET', 'USER', $1, '{"via":"cli"}'::jsonb, 'SUCCESS')`,
        [admin.id],
      );
    });
  } finally {
    await dataSource.destroy();
  }

  write('\n=== 2FA del admin reiniciado. Esta es la ÚNICA vez que se muestran estos datos. ===\n');
  write('Cargá el secreto nuevo en tu app de autenticación; el anterior ya no sirve.');
  write(`Secreto:     ${enrollment.secret}`);
  write(`URI (QR):    ${enrollment.otpauthUri}`);
  write('\nCódigos de recuperación nuevos (los anteriores quedaron anulados):');
  for (const code of enrollment.recoveryCodes) write(`  ${code}`);
  write('\nSe cerraron todas las sesiones del admin. Guardá todo en un gestor de contraseñas.');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `No se reinició el 2FA: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
