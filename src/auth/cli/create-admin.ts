import * as argon2 from 'argon2';
import { createInterface } from 'readline/promises';
import { parseArgs } from 'util';
import { encryptField, randomToken } from '../../common/crypto/crypto.utils';
import { validateEnv } from '../../config/env.validation';
import dataSource from '../../database/data-source';
import { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole } from '../../users/user.enums';
import { UserMfaSettings } from '../entities/user-mfa-settings.entity';
import { createMfaEnrollment } from '../mfa-secrets';
import { ARGON2_OPTIONS } from '../services/password.service';

/**
 * `npm run admin:create -- --email … --first-name … --last-name … --phone …`
 *
 * Crea el ÚNICO admin (plan §3.4) con contraseña y segundo factor TOTP generados. La contraseña, el
 * secreto TOTP y los códigos de recuperación se muestran UNA sola vez en esta terminal: no se
 * escriben en logs ni en archivos, y en la base quedan solo el hash y el secreto cifrado.
 */

const write = (text: string) => process.stdout.write(`${text}\n`);

async function prompt(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
}

async function readInput() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'first-name': { type: 'string' },
      'last-name': { type: 'string' },
      phone: { type: 'string' },
    },
  });
  return {
    email: (values.email ?? (await prompt('Email del admin'))).toLowerCase(),
    firstName: values['first-name'] ?? (await prompt('Nombre')),
    lastName: values['last-name'] ?? (await prompt('Apellido')),
    phone: (values.phone ?? (await prompt('Teléfono'))).replace(/[\s()-]/g, ''),
  };
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const input = await readInput();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new Error('Email inválido.');
  if (!input.firstName || !input.lastName) throw new Error('Nombre y apellido son obligatorios.');
  if (!/^\+?\d{8,15}$/.test(input.phone)) throw new Error('Teléfono inválido.');

  // 24 caracteres base64url (~144 bits): supera el mínimo de 12 del admin (ADR 0011).
  const password = randomToken(18);
  const enrollment = createMfaEnrollment(input.email);
  const encryptionKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      if (await users.existsBy({ role: UserRole.ADMIN })) {
        throw new Error('Ya existe un admin. Este comando solo crea el primero.');
      }
      if (await users.existsBy({ email: input.email }))
        throw new Error('Ese email ya está registrado.');

      const admin = users.create({
        ...input,
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
      });
      await users.insert(admin);
      await manager.getRepository(UserMfaSettings).insert({
        userId: admin.id,
        totpSecretEncrypted: encryptField(
          enrollment.secret,
          encryptionKey,
          env.DATA_ENCRYPTION_KEY_VERSION,
        ),
        recoveryCodeHashes: enrollment.recoveryCodeHashes,
        enabledAt: new Date(),
      });
      await manager.query(
        `INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, metadata, result)
         VALUES (NULL, 'ADMIN_CREATED', 'USER', $1, '{"via":"cli"}'::jsonb, 'SUCCESS')`,
        [admin.id],
      );
    });
  } finally {
    await dataSource.destroy();
  }

  write('\n=== Admin creado. Esta es la ÚNICA vez que se muestran estos datos. ===\n');
  write(`Email:       ${input.email}`);
  write(`Contraseña:  ${password}`);
  write(
    '\nSegundo factor (TOTP): cargalo en tu app de autenticación (Google Authenticator, Authy, 1Password).',
  );
  write(`Secreto:     ${enrollment.secret}`);
  write(`URI (QR):    ${enrollment.otpauthUri}`);
  write('\nCódigos de recuperación (uno por uso, si perdés el dispositivo):');
  for (const code of enrollment.recoveryCodes) write(`  ${code}`);
  write('\nGuardalos en un gestor de contraseñas y cambiá la contraseña después del primer login.');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `No se creó el admin: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
