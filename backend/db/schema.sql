-- Kanban board schema
-- Run against the "kanban" database:  psql "$DATABASE_URL" -f schema.sql
-- Idempotent-ish: safe to re-run on a fresh database.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    google_sub   TEXT UNIQUE,
    name         TEXT        NOT NULL,
    email        TEXT        NOT NULL UNIQUE,
    picture      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);

-- ---------------------------------------------------------------------------
-- cards  (stage = the kanban column the card lives in)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_stage') THEN
        CREATE TYPE card_stage AS ENUM ('todo', 'in_progress', 'completed');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS cards (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT,
    stage       card_stage  NOT NULL DEFAULT 'todo',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cards ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cards_stage ON cards (stage);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards (user_id);

-- ---------------------------------------------------------------------------
-- card_users  (join table: a card can be assigned to many users,
--              and a user can have many cards)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_users (
    card_id     BIGINT      NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_card_users_user ON card_users (user_id);
