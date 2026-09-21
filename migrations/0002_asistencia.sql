-- ---------------------------------------------------------------------------
-- Opcion "no asistire".
--
-- No se modela como una pelicula mas: quien no va no esta eligiendo pelicula,
-- y mezclarlo con la cartelera falsearia los porcentajes, apareceria como una
-- tarjeta con cartelera en la pantalla de votacion y se copiaria al duplicar
-- una votacion.
--
-- Se modela como un atributo del voto:
--   attending = 1  ->  asiste y elige una pelicula (option_id obligatorio)
--   attending = 0  ->  no asiste (option_id debe ser NULL)
--
-- Asi el recuento de entradas a comprar es una consulta directa y la
-- restriccion UNIQUE (poll_id, user_id) sigue garantizando un voto por
-- persona, elija lo que elija.
-- ---------------------------------------------------------------------------

-- Configurable por votacion: hay votaciones donde "no asistire" no aplica.
ALTER TABLE polls ADD COLUMN allow_not_attending INTEGER NOT NULL DEFAULT 1;

-- SQLite no permite relajar un NOT NULL con ALTER TABLE, asi que `votes` se
-- reconstruye. Los votos existentes son todos asistencias, por definicion.
CREATE TABLE votes_nueva (
  id            TEXT PRIMARY KEY,
  poll_id       TEXT NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- NULL solo cuando la persona ha dicho que no asiste.
  option_id     TEXT REFERENCES poll_options (id) ON DELETE CASCADE,
  attending     INTEGER NOT NULL DEFAULT 1 CHECK (attending IN (0, 1)),
  change_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (poll_id, user_id),
  -- La base impide estados imposibles: asistir sin pelicula, o no asistir
  -- habiendo elegido una.
  CHECK (
    (attending = 1 AND option_id IS NOT NULL) OR
    (attending = 0 AND option_id IS NULL)
  )
);

INSERT INTO votes_nueva (id, poll_id, user_id, option_id, attending, change_count, created_at, updated_at)
SELECT id, poll_id, user_id, option_id, 1, change_count, created_at, updated_at
  FROM votes;

DROP TABLE votes;

ALTER TABLE votes_nueva RENAME TO votes;

CREATE INDEX idx_votes_poll ON votes (poll_id);
CREATE INDEX idx_votes_option ON votes (option_id);
CREATE INDEX idx_votes_user ON votes (user_id);
-- Indice del recuento de asistencia, que es la consulta del resumen.
CREATE INDEX idx_votes_attending ON votes (poll_id, attending);
