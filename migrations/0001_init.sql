-- ---------------------------------------------------------------------------
-- Esquema inicial del sistema privado de votaciones.
--
-- Convenciones:
--   * ids: TEXT (UUID v4)
--   * timestamps: TEXT en ISO-8601 UTC (`2026-09-21T14:00:00.000Z`).
--     Al usar siempre el mismo formato, la comparacion lexicografica equivale
--     a la comparacion cronologica, que es lo que aprovechan los indices.
--   * booleanos: INTEGER 0/1 con CHECK.
-- ---------------------------------------------------------------------------

-- Usuarios: creados EXCLUSIVAMENTE por un administrador. No hay registro publico.
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  username              TEXT NOT NULL,
  -- Clave real de unicidad: evita que existan "Carlos01" y "carlos01".
  username_lower        TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'VOTER' CHECK (role IN ('ADMIN', 'VOTER')),
  status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  last_login_at         TEXT,
  password_changed_at   TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_role ON users (role);

-- Sesiones: se guarda el SHA-256 del token, nunca el token en claro.
-- Si la base se filtra, los tokens almacenados no sirven para suplantar a nadie.
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Votaciones. `kind` permite reutilizar el sistema para votaciones que no sean
-- de peliculas sin tocar el esquema.
CREATE TABLE polls (
  id                        TEXT PRIMARY KEY,
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  description               TEXT,
  kind                      TEXT NOT NULL DEFAULT 'MOVIE_NIGHT' CHECK (kind IN ('MOVIE_NIGHT', 'GENERIC')),
  status                    TEXT NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED')),

  -- Reglas configurables por el administrador (se aplican SIEMPRE en backend).
  allow_vote_change         INTEGER NOT NULL DEFAULT 1 CHECK (allow_vote_change IN (0, 1)),
  show_live_results         INTEGER NOT NULL DEFAULT 0 CHECK (show_live_results IN (0, 1)),
  show_results_after_close  INTEGER NOT NULL DEFAULT 1 CHECK (show_results_after_close IN (0, 1)),

  -- Programacion opcional. Si existen, acotan la ventana de votacion.
  starts_at                 TEXT,
  ends_at                   TEXT,

  published_at              TEXT,
  opened_at                 TEXT,
  closed_at                 TEXT,
  archived_at               TEXT,

  created_by                TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX idx_polls_status ON polls (status);
CREATE INDEX idx_polls_created_at ON polls (created_at DESC);
CREATE INDEX idx_polls_schedule ON polls (status, starts_at, ends_at);

-- Opciones de la votacion. Para Movie Night, cada opcion es una pelicula.
CREATE TABLE poll_options (
  id                TEXT PRIMARY KEY,
  poll_id           TEXT NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  genre             TEXT,
  year              INTEGER,
  duration_minutes  INTEGER,
  -- Hora de proyeccion, texto libre corto ("20:00", "8:00 PM").
  showtime          TEXT,
  -- Clave del objeto en R2. La imagen NUNCA se guarda en D1.
  poster_key        TEXT,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_poll_options_poll ON poll_options (poll_id, position);

-- Votos.
--
-- RESTRICCION CRITICA: UNIQUE (poll_id, user_id).
-- Es la base de datos quien garantiza "un usuario = un voto por votacion".
-- El frontend y la API son solo la primera linea de defensa.
CREATE TABLE votes (
  id            TEXT PRIMARY KEY,
  poll_id       TEXT NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  option_id     TEXT NOT NULL REFERENCES poll_options (id) ON DELETE CASCADE,
  change_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_votes_poll ON votes (poll_id);
CREATE INDEX idx_votes_option ON votes (option_id);
CREATE INDEX idx_votes_user ON votes (user_id);

-- Auditoria de acciones administrativas y de seguridad.
-- `actor_username` se desnormaliza para que el log siga siendo legible
-- aunque el usuario se elimine despues.
CREATE TABLE audit_logs (
  id              TEXT PRIMARY KEY,
  actor_id        TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor_username  TEXT,
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       TEXT,
  metadata        TEXT,
  ip              TEXT,
  user_agent      TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);

-- Intentos de login, para limitar fuerza bruta sin depender de servicios externos.
CREATE TABLE login_attempts (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  ip          TEXT NOT NULL,
  success     INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_login_attempts_identifier ON login_attempts (identifier, created_at DESC);
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip, created_at DESC);
CREATE INDEX idx_login_attempts_created_at ON login_attempts (created_at);
