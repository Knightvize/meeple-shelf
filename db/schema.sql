CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  notify_email  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,            -- e.g. 'bgg'
  source_id      BIGINT NOT NULL,
  title          TEXT NOT NULL,
  year_published INT,
  min_players    INT,
  max_players    INT,
  image_url      TEXT,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at    TIMESTAMPTZ,              -- NULL = release matching not yet run
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS games_title_idx ON games (lower(title));

-- Series/franchise ("family"), designers and publishers drive "related game" matching.
CREATE TABLE IF NOT EXISTS game_families   (game_id BIGINT REFERENCES games ON DELETE CASCADE, family   TEXT NOT NULL, PRIMARY KEY (game_id, family));
CREATE TABLE IF NOT EXISTS game_designers  (game_id BIGINT REFERENCES games ON DELETE CASCADE, designer TEXT NOT NULL, PRIMARY KEY (game_id, designer));
CREATE TABLE IF NOT EXISTS game_publishers (game_id BIGINT REFERENCES games ON DELETE CASCADE, publisher TEXT NOT NULL, PRIMARY KEY (game_id, publisher));
CREATE INDEX IF NOT EXISTS gf_idx ON game_families (family);
CREATE INDEX IF NOT EXISTS gd_idx ON game_designers (designer);

CREATE TABLE IF NOT EXISTS shelf_entries (
  user_id    BIGINT REFERENCES users ON DELETE CASCADE,
  game_id    BIGINT REFERENCES games ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('want','own','played')),
  rating     SMALLINT CHECK (rating BETWEEN 1 AND 5),
  review     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX IF NOT EXISTS shelf_game_idx ON shelf_entries (game_id);

CREATE TABLE IF NOT EXISTS notifications (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
  game_id        BIGINT NOT NULL REFERENCES games ON DELETE CASCADE,   -- the NEW game
  reason         TEXT NOT NULL,                                        -- same_family | same_designer
  reason_game_id BIGINT REFERENCES games ON DELETE SET NULL,           -- the game they played/owned
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at     TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  UNIQUE (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
