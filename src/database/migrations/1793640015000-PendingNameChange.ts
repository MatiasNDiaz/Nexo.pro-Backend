import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0021: cambio de nombre con la identidad aprobada. Queda pendiente, en la misma revisión que
 * la foto (ADR 0019), que pasa a llamarse PROFILE_CHANGE.
 */
export class PendingNameChange1793640015000 implements MigrationInterface {
  name = 'PendingNameChange1793640015000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE verification_kind RENAME VALUE 'AVATAR_CHANGE' TO 'PROFILE_CHANGE'`);
    await q.query(`
      ALTER TABLE users
        ADD COLUMN pending_first_name varchar(60),
        ADD COLUMN pending_last_name varchar(60),
        ADD CONSTRAINT ck_users_pending_name
          CHECK ((pending_first_name IS NULL) = (pending_last_name IS NULL))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_pending_name,
        DROP COLUMN pending_first_name,
        DROP COLUMN pending_last_name`);
    await q.query(`ALTER TYPE verification_kind RENAME VALUE 'PROFILE_CHANGE' TO 'AVATAR_CHANGE'`);
  }
}
