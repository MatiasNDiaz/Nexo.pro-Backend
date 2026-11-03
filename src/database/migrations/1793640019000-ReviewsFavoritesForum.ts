import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 10 (ADR 0028): reseñas, favoritos, reseñas de la plataforma y foro. Los archivos del foro
 * son `file_purpose` = FORUM_MEDIA (esta migración no usa el valor nuevo, como exige PostgreSQL
 * dentro de la misma transacción). Nada se borra de verdad: `deleted_at` y ocultos por el admin.
 */
export class ReviewsFavoritesForum1793640019000 implements MigrationInterface {
  name = 'ReviewsFavoritesForum1793640019000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE file_purpose ADD VALUE 'FORUM_MEDIA'`);
    await q.query(`CREATE TYPE content_status AS ENUM ('VISIBLE', 'HIDDEN_BY_ADMIN')`);
    await q.query(`CREATE TYPE forum_post_type AS ENUM ('QUESTION', 'PROFESSIONAL_WANTED')`);

    // --- Reseñas (una por contratación terminada) ---
    await q.query(`
      CREATE TABLE reviews (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        professional_id uuid NOT NULL,
        rating smallint NOT NULL,
        comment varchar(1000),
        reply_body varchar(1000),
        replied_at timestamptz,
        status content_status NOT NULL DEFAULT 'VISIBLE',
        hidden_by uuid,
        hidden_at timestamptz,
        hidden_reason varchar(300),
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_reviews PRIMARY KEY (id),
        CONSTRAINT fk_reviews_contract_id FOREIGN KEY (contract_id)
          REFERENCES service_contracts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reviews_customer_id FOREIGN KEY (customer_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reviews_professional_id FOREIGN KEY (professional_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reviews_hidden_by FOREIGN KEY (hidden_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5),
        CONSTRAINT ck_reviews_reply CHECK ((reply_body IS NULL) = (replied_at IS NULL)),
        CONSTRAINT ck_reviews_hidden
          CHECK (status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL))
      )`);
    // Una sola reseña sin borrar por contratación (borrada dentro del plazo, se puede volver a reseñar).
    await q.query(
      `CREATE UNIQUE INDEX uq_reviews_contract_live ON reviews (contract_id) WHERE deleted_at IS NULL`,
    );
    await q.query(`CREATE INDEX ix_reviews_contract_id ON reviews (contract_id)`);
    await q.query(`CREATE INDEX ix_reviews_customer_id ON reviews (customer_id)`);
    await q.query(`CREATE INDEX ix_reviews_professional_id ON reviews (professional_id)`);
    await q.query(`CREATE INDEX ix_reviews_hidden_by ON reviews (hidden_by)`);

    // --- Favoritos ---
    await q.query(`
      CREATE TABLE favorites (
        customer_id uuid NOT NULL,
        professional_id uuid NOT NULL,
        availability_alerts boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_favorites PRIMARY KEY (customer_id, professional_id),
        CONSTRAINT fk_favorites_customer_id FOREIGN KEY (customer_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_favorites_professional_id FOREIGN KEY (professional_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_favorites_not_self CHECK (customer_id <> professional_id)
      )`);
    await q.query(`CREATE INDEX ix_favorites_professional_id ON favorites (professional_id)`);

    // --- Reseñas de la plataforma ---
    await q.query(`
      CREATE TABLE platform_reviews (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        rating smallint NOT NULL,
        comment varchar(1000),
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_platform_reviews PRIMARY KEY (id),
        CONSTRAINT uq_platform_reviews_user_id UNIQUE (user_id),
        CONSTRAINT fk_platform_reviews_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_platform_reviews_rating CHECK (rating BETWEEN 1 AND 5)
      )`);

    // --- Foro ---
    await q.query(`
      CREATE TABLE forum_posts (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        author_id uuid NOT NULL,
        type forum_post_type NOT NULL,
        body varchar(2000) NOT NULL,
        locality_id uuid,
        neighborhood_id uuid,
        budget_estimate numeric(12, 2),
        deadline date,
        resolved_at timestamptz,
        status content_status NOT NULL DEFAULT 'VISIBLE',
        hidden_by uuid,
        hidden_at timestamptz,
        hidden_reason varchar(300),
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_forum_posts PRIMARY KEY (id),
        CONSTRAINT fk_forum_posts_author_id FOREIGN KEY (author_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_posts_locality_id FOREIGN KEY (locality_id)
          REFERENCES localities (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_posts_neighborhood_id_locality_id
          FOREIGN KEY (neighborhood_id, locality_id)
          REFERENCES neighborhoods (id, locality_id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_posts_hidden_by FOREIGN KEY (hidden_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_forum_posts_neighborhood CHECK (neighborhood_id IS NULL OR locality_id IS NOT NULL),
        CONSTRAINT ck_forum_posts_budget CHECK (budget_estimate IS NULL OR budget_estimate > 0),
        CONSTRAINT ck_forum_posts_hidden
          CHECK (status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX ix_forum_posts_author_id ON forum_posts (author_id)`);
    await q.query(`CREATE INDEX ix_forum_posts_locality_id ON forum_posts (locality_id)`);
    await q.query(`CREATE INDEX ix_forum_posts_neighborhood_id ON forum_posts (neighborhood_id)`);
    await q.query(`CREATE INDEX ix_forum_posts_hidden_by ON forum_posts (hidden_by)`);
    await q.query(`CREATE INDEX ix_forum_posts_created_at ON forum_posts (created_at)`);

    await q.query(`
      CREATE TABLE forum_post_professions (
        post_id uuid NOT NULL,
        profession_id uuid NOT NULL,
        CONSTRAINT pk_forum_post_professions PRIMARY KEY (post_id, profession_id),
        CONSTRAINT fk_forum_post_professions_post_id FOREIGN KEY (post_id)
          REFERENCES forum_posts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_post_professions_profession_id FOREIGN KEY (profession_id)
          REFERENCES professions (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_forum_post_professions_profession_id ON forum_post_professions (profession_id)`,
    );

    await q.query(`
      CREATE TABLE forum_post_media (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL,
        file_id uuid NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_forum_post_media PRIMARY KEY (id),
        CONSTRAINT uq_forum_post_media_file_id UNIQUE (file_id),
        CONSTRAINT fk_forum_post_media_post_id FOREIGN KEY (post_id)
          REFERENCES forum_posts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_post_media_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT,
        CONSTRAINT ck_forum_post_media_position CHECK (position >= 0)
      )`);
    await q.query(`CREATE INDEX ix_forum_post_media_post_id ON forum_post_media (post_id)`);

    await q.query(`
      CREATE TABLE forum_replies (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL,
        parent_reply_id uuid,
        author_id uuid NOT NULL,
        body varchar(1000) NOT NULL,
        proposed_price numeric(12, 2),
        status content_status NOT NULL DEFAULT 'VISIBLE',
        hidden_by uuid,
        hidden_at timestamptz,
        hidden_reason varchar(300),
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_forum_replies PRIMARY KEY (id),
        -- Para que la respuesta padre sea de la misma publicación (FK compuesta).
        CONSTRAINT uq_forum_replies_id_post_id UNIQUE (id, post_id),
        CONSTRAINT fk_forum_replies_post_id FOREIGN KEY (post_id)
          REFERENCES forum_posts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_replies_parent_reply_id_post_id
          FOREIGN KEY (parent_reply_id, post_id)
          REFERENCES forum_replies (id, post_id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_replies_author_id FOREIGN KEY (author_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_replies_hidden_by FOREIGN KEY (hidden_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_forum_replies_price CHECK (proposed_price IS NULL OR proposed_price > 0),
        CONSTRAINT ck_forum_replies_hidden
          CHECK (status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX ix_forum_replies_post_id ON forum_replies (post_id)`);
    await q.query(
      `CREATE INDEX ix_forum_replies_parent_reply_id ON forum_replies (parent_reply_id)`,
    );
    await q.query(`CREATE INDEX ix_forum_replies_author_id ON forum_replies (author_id)`);
    await q.query(`CREATE INDEX ix_forum_replies_hidden_by ON forum_replies (hidden_by)`);

    await q.query(`
      CREATE TABLE forum_post_likes (
        post_id uuid NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_forum_post_likes PRIMARY KEY (post_id, user_id),
        CONSTRAINT fk_forum_post_likes_post_id FOREIGN KEY (post_id)
          REFERENCES forum_posts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_post_likes_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(`CREATE INDEX ix_forum_post_likes_user_id ON forum_post_likes (user_id)`);

    await q.query(`
      CREATE TABLE forum_reply_likes (
        reply_id uuid NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_forum_reply_likes PRIMARY KEY (reply_id, user_id),
        CONSTRAINT fk_forum_reply_likes_reply_id FOREIGN KEY (reply_id)
          REFERENCES forum_replies (id) ON DELETE RESTRICT,
        CONSTRAINT fk_forum_reply_likes_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(`CREATE INDEX ix_forum_reply_likes_user_id ON forum_reply_likes (user_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE forum_reply_likes`);
    await q.query(`DROP TABLE forum_post_likes`);
    await q.query(`DROP TABLE forum_replies`);
    await q.query(`DROP TABLE forum_post_media`);
    await q.query(`DROP TABLE forum_post_professions`);
    await q.query(`DROP TABLE forum_posts`);
    await q.query(`DROP TABLE platform_reviews`);
    await q.query(`DROP TABLE favorites`);
    await q.query(`DROP TABLE reviews`);
    await q.query(`DROP TYPE forum_post_type`);
    await q.query(`DROP TYPE content_status`);
    // PostgreSQL no permite quitar valores de un enum: se recrea sin FORUM_MEDIA.
    await q.query(`ALTER TABLE stored_files ALTER COLUMN purpose TYPE text`);
    await q.query(`DROP TYPE file_purpose`);
    await q.query(
      `CREATE TYPE file_purpose AS ENUM ('AVATAR', 'PROFILE_MEDIA', 'CERTIFICATE', 'CHAT_ATTACHMENT')`,
    );
    await q.query(
      `ALTER TABLE stored_files ALTER COLUMN purpose TYPE file_purpose USING purpose::file_purpose`,
    );
  }
}
