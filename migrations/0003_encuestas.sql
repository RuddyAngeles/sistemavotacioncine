-- ---------------------------------------------------------------------------
-- Modulo de encuestas.
--
-- Una encuesta no es una votacion con otro nombre: tiene varias preguntas, de
-- tipos distintos, y puede ser anonima. Lo anonimo es lo que obliga a un
-- esquema propio y no a reutilizar `votes`, porque alli cada voto guarda el
-- `user_id` justo al lado de la eleccion.
--
-- EL ANONIMATO ES ESTRUCTURAL, NO UNA BANDERA QUE LA INTERFAZ RESPETE:
--
--   survey_participants  -> QUIEN respondio. Nunca contiene respuestas.
--   survey_submissions   -> UN envio. En las anonimas, `user_id` es NULL.
--   survey_answers       -> las respuestas, colgando del envio.
--
-- No existe ninguna columna ni indice que relacione una fila de participantes
-- con una de envios. Ni la aplicacion ni una consulta SQL directa pueden
-- deshacer el anonimato, porque el dato sencillamente no se guarda.
-- ---------------------------------------------------------------------------

-- Permiso nuevo, independiente del rol: poder participar en encuestas.
-- Nace apagado en todas las cuentas por decision del administrador; hay una
-- accion en la pantalla de Usuarios para activarlo en bloque.
ALTER TABLE users ADD COLUMN can_answer_surveys INTEGER NOT NULL DEFAULT 0
  CHECK (can_answer_surveys IN (0, 1));

CREATE INDEX idx_users_surveys ON users (can_answer_surveys);

-- ---------------------------------------------------------------------------

CREATE TABLE surveys (
  id                        TEXT PRIMARY KEY,
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  description               TEXT,

  -- Una vez abierta la encuesta, esto ya no se puede cambiar: hacerlo
  -- convertiria respuestas identificadas en anonimas o al reves. Lo impide
  -- la capa de servicio, igual que con la cartelera de una votacion.
  anonymous                 INTEGER NOT NULL DEFAULT 0 CHECK (anonymous IN (0, 1)),

  status                    TEXT NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED')),

  -- En las anonimas vale siempre 0: sin vinculo persona-envio, el servidor no
  -- puede localizar "tu respuesta" para modificarla. Lo garantiza el CHECK de
  -- abajo, no solo el formulario.
  allow_response_change     INTEGER NOT NULL DEFAULT 1 CHECK (allow_response_change IN (0, 1)),

  show_live_results         INTEGER NOT NULL DEFAULT 0 CHECK (show_live_results IN (0, 1)),
  show_results_after_close  INTEGER NOT NULL DEFAULT 1 CHECK (show_results_after_close IN (0, 1)),

  starts_at                 TEXT,
  ends_at                   TEXT,

  published_at              TEXT,
  opened_at                 TEXT,
  closed_at                 TEXT,
  archived_at               TEXT,

  created_by                TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,

  CHECK (anonymous = 0 OR allow_response_change = 0)
);

CREATE INDEX idx_surveys_status ON surveys (status);
CREATE INDEX idx_surveys_created_at ON surveys (created_at DESC);
CREATE INDEX idx_surveys_schedule ON surveys (status, starts_at, ends_at);

-- ---------------------------------------------------------------------------

CREATE TABLE survey_questions (
  id              TEXT PRIMARY KEY,
  survey_id       TEXT NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
  position        INTEGER NOT NULL DEFAULT 0,

  type            TEXT NOT NULL CHECK (type IN ('SINGLE', 'MULTIPLE', 'TEXT', 'SCALE')),
  text            TEXT NOT NULL,
  help            TEXT,
  required        INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),

  -- Solo para MULTIPLE: cuantas opciones se pueden marcar.
  min_choices     INTEGER,
  max_choices     INTEGER,

  -- Solo para SCALE. Por defecto, del 1 al 10.
  scale_min       INTEGER NOT NULL DEFAULT 1,
  scale_max       INTEGER NOT NULL DEFAULT 10,
  scale_min_label TEXT,
  scale_max_label TEXT,

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  CHECK (scale_min < scale_max),
  CHECK (min_choices IS NULL OR max_choices IS NULL OR min_choices <= max_choices)
);

CREATE INDEX idx_survey_questions_survey ON survey_questions (survey_id, position);

-- Opciones de una pregunta de tipo SINGLE o MULTIPLE.
CREATE TABLE survey_options (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES survey_questions (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_survey_options_question ON survey_options (question_id, position);

-- ---------------------------------------------------------------------------
-- Participacion: quien ha respondido. Informacion de organizacion.
--
-- Esta tabla existe TAMBIEN en las encuestas anonimas, y es lo que permite
-- saber a quien hay que recordarselo. Lo que no contiene, ni contendra, es
-- ninguna referencia al envio.
-- ---------------------------------------------------------------------------
CREATE TABLE survey_participants (
  survey_id     TEXT NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  submitted_at  TEXT NOT NULL,
  PRIMARY KEY (survey_id, user_id)
) WITHOUT ROWID;

-- ---------------------------------------------------------------------------
-- Envios.
--
-- `user_id` es NULL en las encuestas anonimas. No es un descuido: es la
-- ausencia de ese dato lo que hace que la encuesta sea anonima.
--
-- WITHOUT ROWID a proposito: con rowid, las filas quedan fisicamente en orden
-- de insercion, y quien leyera la base a pelo podria emparejar el envio n-esimo
-- con el participante n-esimo. Al ordenarse por un id aleatorio, ese rastro
-- desaparece.
-- ---------------------------------------------------------------------------
CREATE TABLE survey_submissions (
  id            TEXT PRIMARY KEY,
  survey_id     TEXT NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users (id) ON DELETE CASCADE,
  -- En las anonimas se guarda redondeado al dia, para que la hora exacta no
  -- sirva de puente entre el envio y la fila de participacion.
  submitted_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  change_count  INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX idx_survey_submissions_survey ON survey_submissions (survey_id);

-- Un envio por persona en las encuestas identificadas. El indice parcial no
-- afecta a las anonimas, donde todos los `user_id` son NULL.
CREATE UNIQUE INDEX idx_survey_submissions_unico
  ON survey_submissions (survey_id, user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------

CREATE TABLE survey_answers (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NOT NULL REFERENCES survey_submissions (id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES survey_questions (id) ON DELETE CASCADE,

  -- Segun el tipo de pregunta se rellena una y solo una de estas tres.
  option_id      TEXT REFERENCES survey_options (id) ON DELETE CASCADE,
  text_value     TEXT,
  scale_value    INTEGER,

  created_at     TEXT NOT NULL,

  CHECK (
    (option_id IS NOT NULL AND text_value IS NULL AND scale_value IS NULL) OR
    (option_id IS NULL AND text_value IS NOT NULL AND scale_value IS NULL) OR
    (option_id IS NULL AND text_value IS NULL AND scale_value IS NOT NULL)
  )
);

CREATE INDEX idx_survey_answers_submission ON survey_answers (submission_id);
CREATE INDEX idx_survey_answers_question ON survey_answers (question_id);
CREATE INDEX idx_survey_answers_option ON survey_answers (option_id);
