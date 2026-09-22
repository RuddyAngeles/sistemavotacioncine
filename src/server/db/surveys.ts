import type { SurveyRuleState } from '../../shared/policy'
import type {
  PollStatus,
  SurveyDTO,
  SurveyQuestionDTO,
  SurveyQuestionType,
} from '../../shared/types'
import { all, bool, buildUpdate, count, first, fromBool, type SqlValue } from './client'

/**
 * Acceso a datos de las encuestas.
 *
 * La pieza que hay que leer con atencion es `insertSubmission`: es la unica
 * que decide si el envio queda ligado a una persona. En una encuesta anonima
 * se guarda `user_id = NULL` y la marca de tiempo redondeada al dia, de modo
 * que no queda ningun rastro que permita reconstruir quien dijo que. No es
 * que la consulta "no lo devuelva": es que el dato no llega a escribirse.
 */

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------

export interface SurveyRow {
  id: string
  slug: string
  title: string
  description: string | null
  anonymous: number
  status: PollStatus
  allow_response_change: number
  show_live_results: number
  show_results_after_close: number
  starts_at: string | null
  ends_at: string | null
  published_at: string | null
  opened_at: string | null
  closed_at: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  question_count: number
  response_count: number
}

const CAMPOS = `
  s.id, s.slug, s.title, s.description, s.anonymous, s.status,
  s.allow_response_change, s.show_live_results, s.show_results_after_close,
  s.starts_at, s.ends_at, s.published_at, s.opened_at, s.closed_at,
  s.archived_at, s.created_by, s.created_at, s.updated_at,
  (SELECT COUNT(*) FROM survey_questions q WHERE q.survey_id = s.id) AS question_count,
  (SELECT COUNT(*) FROM survey_submissions e WHERE e.survey_id = s.id) AS response_count
`

export function toSurveyDTO(row: SurveyRow): SurveyDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    anonymous: fromBool(row.anonymous),
    status: row.status,
    allowResponseChange: fromBool(row.allow_response_change),
    showLiveResults: fromBool(row.show_live_results),
    showResultsAfterClose: fromBool(row.show_results_after_close),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publishedAt: row.published_at,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    questionCount: row.question_count,
    responseCount: row.response_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSurveyRuleState(row: SurveyRow): SurveyRuleState {
  return {
    status: row.status,
    anonymous: fromBool(row.anonymous),
    allowResponseChange: fromBool(row.allow_response_change),
    showLiveResults: fromBool(row.show_live_results),
    showResultsAfterClose: fromBool(row.show_results_after_close),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

export function findSurvey(db: D1Database, id: string): Promise<SurveyRow | null> {
  return first<SurveyRow>(db.prepare(`SELECT ${CAMPOS} FROM surveys s WHERE s.id = ?`).bind(id))
}

export function findSurveyBySlug(db: D1Database, slug: string): Promise<SurveyRow | null> {
  return first<SurveyRow>(db.prepare(`SELECT ${CAMPOS} FROM surveys s WHERE s.slug = ?`).bind(slug))
}

export interface ListSurveysFilters {
  status?: PollStatus
  search?: string
  limit: number
  offset: number
}

export async function listSurveys(
  db: D1Database,
  filtros: ListSurveysFilters,
): Promise<{ rows: SurveyRow[]; total: number }> {
  const condiciones: string[] = []
  const valores: SqlValue[] = []

  if (filtros.status) {
    condiciones.push('s.status = ?')
    valores.push(filtros.status)
  }
  if (filtros.search) {
    condiciones.push('s.title LIKE ?')
    valores.push('%' + filtros.search + '%')
  }

  const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : ''

  const total = await count(
    db.prepare(`SELECT COUNT(*) AS value FROM surveys s ${where}`).bind(...valores),
  )

  const rows = await all<SurveyRow>(
    db
      .prepare(`SELECT ${CAMPOS} FROM surveys s ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...valores, filtros.limit, filtros.offset),
  )

  return { rows, total }
}

/** Encuestas que un participante puede ver: todo menos los borradores. */
export function listVisibleSurveys(db: D1Database): Promise<SurveyRow[]> {
  return all<SurveyRow>(
    db.prepare(`SELECT ${CAMPOS} FROM surveys s WHERE s.status <> 'DRAFT' ORDER BY s.created_at DESC`),
  )
}

/** Candidatas a abrirse o cerrarse solas segun su programacion. */
export function listScheduledSurveys(db: D1Database, ahora: string): Promise<SurveyRow[]> {
  return all<SurveyRow>(
    db
      .prepare(
        `SELECT ${CAMPOS} FROM surveys s
          WHERE (s.status = 'SCHEDULED' AND s.starts_at IS NOT NULL AND s.starts_at <= ?)
             OR (s.status = 'ACTIVE' AND s.ends_at IS NOT NULL AND s.ends_at <= ?)`,
      )
      .bind(ahora, ahora),
  )
}

export interface InsertSurvey {
  id: string
  slug: string
  title: string
  description: string | null
  anonymous: boolean
  allowResponseChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
  startsAt: string | null
  endsAt: string | null
  createdBy: string | null
  now: string
}

export async function insertSurvey(db: D1Database, datos: InsertSurvey): Promise<void> {
  await db
    .prepare(
      `INSERT INTO surveys
         (id, slug, title, description, anonymous, status, allow_response_change,
          show_live_results, show_results_after_close, starts_at, ends_at,
          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      datos.id,
      datos.slug,
      datos.title,
      datos.description,
      bool(datos.anonymous),
      // Toda encuesta nace como borrador: publicar y abrir son pasos aparte.
      'DRAFT',
      // El CHECK de la tabla exige que una anonima no admita cambios; aqui se
      // respeta ya, para que el error nunca llegue a producirse.
      bool(datos.anonymous ? false : datos.allowResponseChange),
      bool(datos.showLiveResults),
      bool(datos.showResultsAfterClose),
      datos.startsAt,
      datos.endsAt,
      datos.createdBy,
      datos.now,
      datos.now,
    )
    .run()
}

export async function updateSurvey(
  db: D1Database,
  id: string,
  patch: Record<string, SqlValue | undefined>,
): Promise<void> {
  const { clause, values } = buildUpdate(patch)
  if (!clause) return
  await db.prepare(`UPDATE surveys SET ${clause} WHERE id = ?`).bind(...values, id).run()
}

export async function deleteSurvey(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run()
}

export async function slugExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    db.prepare('SELECT id FROM surveys WHERE slug = ?').bind(slug),
  )
  return row !== null
}

// ---------------------------------------------------------------------------
// Preguntas y opciones
// ---------------------------------------------------------------------------

export interface QuestionRow {
  id: string
  survey_id: string
  position: number
  type: SurveyQuestionType
  text: string
  help: string | null
  required: number
  min_choices: number | null
  max_choices: number | null
  scale_min: number
  scale_max: number
  scale_min_label: string | null
  scale_max_label: string | null
}

export interface OptionRow {
  id: string
  question_id: string
  position: number
  text: string
}

/** Preguntas con sus opciones, en el orden en que se responden. */
export async function listQuestions(
  db: D1Database,
  surveyId: string,
): Promise<SurveyQuestionDTO[]> {
  const preguntas = await all<QuestionRow>(
    db
      .prepare(
        `SELECT id, survey_id, position, type, text, help, required, min_choices, max_choices,
                scale_min, scale_max, scale_min_label, scale_max_label
           FROM survey_questions WHERE survey_id = ? ORDER BY position, created_at`,
      )
      .bind(surveyId),
  )

  if (preguntas.length === 0) return []

  const opciones = await all<OptionRow>(
    db
      .prepare(
        `SELECT o.id, o.question_id, o.position, o.text
           FROM survey_options o
           JOIN survey_questions q ON q.id = o.question_id
          WHERE q.survey_id = ?
          ORDER BY o.position, o.created_at`,
      )
      .bind(surveyId),
  )

  const porPregunta = new Map<string, OptionRow[]>()
  for (const opcion of opciones) {
    const lista = porPregunta.get(opcion.question_id) ?? []
    lista.push(opcion)
    porPregunta.set(opcion.question_id, lista)
  }

  return preguntas.map((pregunta) => ({
    id: pregunta.id,
    position: pregunta.position,
    type: pregunta.type,
    text: pregunta.text,
    help: pregunta.help,
    required: fromBool(pregunta.required),
    minChoices: pregunta.min_choices,
    maxChoices: pregunta.max_choices,
    scaleMin: pregunta.scale_min,
    scaleMax: pregunta.scale_max,
    scaleMinLabel: pregunta.scale_min_label,
    scaleMaxLabel: pregunta.scale_max_label,
    options: (porPregunta.get(pregunta.id) ?? []).map((opcion) => ({
      id: opcion.id,
      text: opcion.text,
      position: opcion.position,
    })),
  }))
}

export function findQuestion(
  db: D1Database,
  surveyId: string,
  questionId: string,
): Promise<QuestionRow | null> {
  return first<QuestionRow>(
    db
      .prepare('SELECT * FROM survey_questions WHERE id = ? AND survey_id = ?')
      .bind(questionId, surveyId),
  )
}

export async function nextQuestionPosition(db: D1Database, surveyId: string): Promise<number> {
  const row = await first<{ value: number | null }>(
    db
      .prepare('SELECT MAX(position) AS value FROM survey_questions WHERE survey_id = ?')
      .bind(surveyId),
  )
  return (row?.value ?? -1) + 1
}

export interface InsertQuestion {
  id: string
  surveyId: string
  position: number
  type: SurveyQuestionType
  text: string
  help: string | null
  required: boolean
  minChoices: number | null
  maxChoices: number | null
  scaleMinLabel: string | null
  scaleMaxLabel: string | null
  opciones: Array<{ id: string; text: string }>
  now: string
}

/**
 * Crea la pregunta con sus opciones en un solo lote.
 *
 * Va en `batch` para que no pueda quedar una pregunta de opcion unica sin
 * opciones si algo falla a mitad.
 */
export async function insertQuestion(db: D1Database, datos: InsertQuestion): Promise<void> {
  const sentencias = [
    db
      .prepare(
        `INSERT INTO survey_questions
           (id, survey_id, position, type, text, help, required, min_choices, max_choices,
            scale_min_label, scale_max_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        datos.id,
        datos.surveyId,
        datos.position,
        datos.type,
        datos.text,
        datos.help,
        bool(datos.required),
        datos.minChoices,
        datos.maxChoices,
        datos.scaleMinLabel,
        datos.scaleMaxLabel,
        datos.now,
        datos.now,
      ),
    ...datos.opciones.map((opcion, indice) =>
      db
        .prepare(
          `INSERT INTO survey_options (id, question_id, position, text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(opcion.id, datos.id, indice, opcion.text, datos.now, datos.now),
    ),
  ]

  await db.batch(sentencias)
}

/** Sustituye la pregunta y sus opciones. Solo valido sin respuestas recibidas. */
/**
 * Actualiza una pregunta conservando la identidad de sus opciones.
 *
 * Esto NO puede borrar y reinsertar las opciones, aunque sea mas corto de
 * escribir: las respuestas ya guardadas apuntan al id de la opcion, y
 * `ON DELETE CASCADE` se las llevaria por delante sin avisar. Corregir la
 * errata de una opcion dejaria la encuesta sin esas respuestas.
 *
 * Por eso se cruzan por id: las que siguen estando se actualizan en su
 * sitio, las nuevas se insertan y solo se borran las que de verdad ha
 * quitado el administrador (que es el caso que la capa de rutas obliga a
 * confirmar cuando hay respuestas de por medio).
 */
export async function replaceQuestion(db: D1Database, datos: InsertQuestion): Promise<void> {
  const previas = await all<{ id: string }>(
    db.prepare('SELECT id FROM survey_options WHERE question_id = ?').bind(datos.id),
  )
  const existentes = new Set(previas.map((fila) => fila.id))
  const conservadas = new Set(
    datos.opciones.map((opcion) => opcion.id).filter((id) => existentes.has(id)),
  )
  const eliminadas = previas.filter((fila) => !conservadas.has(fila.id))

  const sentencias: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE survey_questions
            SET type = ?, text = ?, help = ?, required = ?, min_choices = ?, max_choices = ?,
                scale_min_label = ?, scale_max_label = ?, updated_at = ?
          WHERE id = ? AND survey_id = ?`,
      )
      .bind(
        datos.type,
        datos.text,
        datos.help,
        bool(datos.required),
        datos.minChoices,
        datos.maxChoices,
        datos.scaleMinLabel,
        datos.scaleMaxLabel,
        datos.now,
        datos.id,
        datos.surveyId,
      ),
  ]

  for (const fila of eliminadas) {
    sentencias.push(db.prepare('DELETE FROM survey_options WHERE id = ?').bind(fila.id))
  }

  datos.opciones.forEach((opcion, indice) => {
    if (existentes.has(opcion.id)) {
      sentencias.push(
        db
          .prepare(
            'UPDATE survey_options SET text = ?, position = ?, updated_at = ? WHERE id = ?',
          )
          .bind(opcion.text, indice, datos.now, opcion.id),
      )
      return
    }
    sentencias.push(
      db
        .prepare(
          `INSERT INTO survey_options (id, question_id, position, text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(opcion.id, datos.id, indice, opcion.text, datos.now, datos.now),
    )
  })

  await db.batch(sentencias)
}

/** Cuantas respuestas hay guardadas para unas opciones concretas. */
export async function countAnswersForOptions(
  db: D1Database,
  optionIds: string[],
): Promise<number> {
  if (optionIds.length === 0) return 0
  const huecos = optionIds.map(() => '?').join(', ')
  return count(
    db
      .prepare(`SELECT COUNT(*) AS value FROM survey_answers WHERE option_id IN (${huecos})`)
      .bind(...optionIds),
  )
}

/** Cuantas respuestas hay guardadas para una pregunta. */
export async function countAnswersForQuestion(
  db: D1Database,
  questionId: string,
): Promise<number> {
  return count(
    db
      .prepare('SELECT COUNT(*) AS value FROM survey_answers WHERE question_id = ?')
      .bind(questionId),
  )
}

/** Las opciones actuales de una pregunta, para cruzarlas con las que llegan. */
export function listOptionIds(db: D1Database, questionId: string): Promise<{ id: string }[]> {
  return all<{ id: string }>(
    db.prepare('SELECT id FROM survey_options WHERE question_id = ?').bind(questionId),
  )
}

export async function deleteQuestion(db: D1Database, surveyId: string, id: string): Promise<void> {
  await db
    .prepare('DELETE FROM survey_questions WHERE id = ? AND survey_id = ?')
    .bind(id, surveyId)
    .run()
}

export async function reorderQuestions(
  db: D1Database,
  surveyId: string,
  ids: string[],
  now: string,
): Promise<void> {
  await db.batch(
    ids.map((id, indice) =>
      db
        .prepare('UPDATE survey_questions SET position = ?, updated_at = ? WHERE id = ? AND survey_id = ?')
        .bind(indice, now, id, surveyId),
    ),
  )
}

// ---------------------------------------------------------------------------
// Participacion y envios
// ---------------------------------------------------------------------------

export async function hasAnswered(
  db: D1Database,
  surveyId: string,
  userId: string,
): Promise<boolean> {
  const row = await first<{ user_id: string }>(
    db
      .prepare('SELECT user_id FROM survey_participants WHERE survey_id = ? AND user_id = ?')
      .bind(surveyId, userId),
  )
  return row !== null
}

export interface SubmissionRow {
  id: string
  survey_id: string
  user_id: string | null
  submitted_at: string
  updated_at: string
  change_count: number
}

/** El envio de una persona concreta. Solo existe en encuestas identificadas. */
export function findSubmissionOf(
  db: D1Database,
  surveyId: string,
  userId: string,
): Promise<SubmissionRow | null> {
  return first<SubmissionRow>(
    db
      .prepare('SELECT * FROM survey_submissions WHERE survey_id = ? AND user_id = ?')
      .bind(surveyId, userId),
  )
}

export interface AnswerToInsert {
  id: string
  questionId: string
  optionId: string | null
  textValue: string | null
  scaleValue: number | null
}

/**
 * Redondea al dia una marca de tiempo.
 *
 * En una encuesta anonima, guardar la hora exacta del envio permitiria
 * emparejarlo con la fila de participacion de quien respondio en ese mismo
 * segundo. Con la fecha basta para ordenar y no sirve de puente.
 */
export function alDia(iso: string): string {
  return iso.slice(0, 10) + 'T00:00:00.000Z'
}

export interface SaveSubmission {
  submissionId: string
  surveyId: string
  /**
   * Quien esta respondiendo.
   *
   * Se usa para DOS cosas distintas que conviene no confundir:
   *   - la fila de participacion, que se escribe siempre;
   *   - la del envio, donde solo se escribe si la encuesta NO es anonima.
   *
   * Por eso aqui no llega ya "nulo o no": llega siempre la persona, y es esta
   * funcion la que decide que no se guarde en el envio.
   */
  participantId: string
  anonymous: boolean
  answers: AnswerToInsert[]
  now: string
}

/**
 * Guarda un envio completo: participacion, envio y respuestas, en un lote.
 *
 * Las tres escrituras van juntas para que no pueda quedar registrada la
 * participacion de alguien cuyas respuestas no llegaron a guardarse, ni al
 * reves. La fila de participacion se escribe SIEMPRE, tambien en las anonimas:
 * es lo que permite saber a quien hay que recordarselo.
 */
export async function saveSubmission(db: D1Database, datos: SaveSubmission): Promise<void> {
  const marca = datos.anonymous ? alDia(datos.now) : datos.now
  // La unica linea que decide si el envio queda ligado a una persona.
  const duenoDelEnvio = datos.anonymous ? null : datos.participantId

  await db.batch([
    db
      .prepare(
        `INSERT INTO survey_participants (survey_id, user_id, submitted_at) VALUES (?, ?, ?)`,
      )
      .bind(datos.surveyId, datos.participantId, datos.now),
    db
      .prepare(
        `INSERT INTO survey_submissions (id, survey_id, user_id, submitted_at, updated_at, change_count)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(datos.submissionId, datos.surveyId, duenoDelEnvio, marca, marca),
    ...datos.answers.map((respuesta) =>
      db
        .prepare(
          `INSERT INTO survey_answers
             (id, submission_id, question_id, option_id, text_value, scale_value, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          respuesta.id,
          datos.submissionId,
          respuesta.questionId,
          respuesta.optionId,
          respuesta.textValue,
          respuesta.scaleValue,
          marca,
        ),
    ),
  ])
}

/** Rehace las respuestas de un envio existente. Nunca en anonimas. */
export async function replaceAnswers(
  db: D1Database,
  submissionId: string,
  answers: AnswerToInsert[],
  now: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM survey_answers WHERE submission_id = ?').bind(submissionId),
    ...answers.map((respuesta) =>
      db
        .prepare(
          `INSERT INTO survey_answers
             (id, submission_id, question_id, option_id, text_value, scale_value, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          respuesta.id,
          submissionId,
          respuesta.questionId,
          respuesta.optionId,
          respuesta.textValue,
          respuesta.scaleValue,
          now,
        ),
    ),
    db
      .prepare(
        'UPDATE survey_submissions SET updated_at = ?, change_count = change_count + 1 WHERE id = ?',
      )
      .bind(now, submissionId),
  ])
}

export async function countSubmissions(db: D1Database, surveyId: string): Promise<number> {
  return count(
    db
      .prepare('SELECT COUNT(*) AS value FROM survey_submissions WHERE survey_id = ?')
      .bind(surveyId),
  )
}

/** Cuentas activas con permiso para participar. Es el censo de la encuesta. */
export async function countEligible(db: D1Database): Promise<number> {
  return count(
    db.prepare(
      `SELECT COUNT(*) AS value FROM users WHERE status = 'ACTIVE' AND can_answer_surveys = 1`,
    ),
  )
}

export interface ParticipantRow {
  user_id: string
  name: string
  username: string
  submitted_at: string | null
}

/**
 * Quien puede participar y quien ya lo ha hecho.
 *
 * Consulta la tabla de participacion, JAMAS la de envios: aqui no hay forma
 * de llegar a una respuesta ni aunque se quisiera.
 */
export function listParticipants(db: D1Database, surveyId: string): Promise<ParticipantRow[]> {
  return all<ParticipantRow>(
    db
      .prepare(
        `SELECT u.id AS user_id, u.name, u.username, p.submitted_at
           FROM users u
           LEFT JOIN survey_participants p ON p.user_id = u.id AND p.survey_id = ?
          WHERE u.status = 'ACTIVE' AND u.can_answer_surveys = 1
          ORDER BY u.name COLLATE NOCASE`,
      )
      .bind(surveyId),
  )
}

// ---------------------------------------------------------------------------
// Recuento de respuestas
// ---------------------------------------------------------------------------

export interface OptionTallyRow {
  question_id: string
  option_id: string
  text: string
  position: number
  total: number
}

export function tallyOptions(db: D1Database, surveyId: string): Promise<OptionTallyRow[]> {
  return all<OptionTallyRow>(
    db
      .prepare(
        `SELECT q.id AS question_id, o.id AS option_id, o.text, o.position,
                COUNT(a.id) AS total
           FROM survey_questions q
           JOIN survey_options o ON o.question_id = q.id
           LEFT JOIN survey_answers a ON a.option_id = o.id
          WHERE q.survey_id = ?
          GROUP BY o.id
          ORDER BY q.position, o.position`,
      )
      .bind(surveyId),
  )
}

export interface ScaleRow {
  question_id: string
  scale_value: number
  total: number
}

export function tallyScales(db: D1Database, surveyId: string): Promise<ScaleRow[]> {
  return all<ScaleRow>(
    db
      .prepare(
        `SELECT a.question_id, a.scale_value, COUNT(*) AS total
           FROM survey_answers a
           JOIN survey_questions q ON q.id = a.question_id
          WHERE q.survey_id = ? AND a.scale_value IS NOT NULL
          GROUP BY a.question_id, a.scale_value
          ORDER BY a.scale_value`,
      )
      .bind(surveyId),
  )
}

export interface TextRow {
  question_id: string
  text_value: string
}

/**
 * Respuestas de texto.
 *
 * Se ordenan por el id del envio (aleatorio) y no por fecha, para que el
 * orden en que aparecen no reproduzca el orden en que se respondio.
 */
export function listTextAnswers(db: D1Database, surveyId: string): Promise<TextRow[]> {
  return all<TextRow>(
    db
      .prepare(
        `SELECT a.question_id, a.text_value
           FROM survey_answers a
           JOIN survey_questions q ON q.id = a.question_id
          WHERE q.survey_id = ? AND a.text_value IS NOT NULL
          ORDER BY a.submission_id`,
      )
      .bind(surveyId),
  )
}

export interface AnsweredRow {
  question_id: string
  total: number
}

/** Cuantos envios han contestado cada pregunta (las opcionales se saltan). */
export function countAnsweredPerQuestion(
  db: D1Database,
  surveyId: string,
): Promise<AnsweredRow[]> {
  return all<AnsweredRow>(
    db
      .prepare(
        `SELECT a.question_id, COUNT(DISTINCT a.submission_id) AS total
           FROM survey_answers a
           JOIN survey_questions q ON q.id = a.question_id
          WHERE q.survey_id = ?
          GROUP BY a.question_id`,
      )
      .bind(surveyId),
  )
}

/** Las respuestas propias, para poder editarlas. Nunca en anonimas. */
export interface MyAnswerRow {
  question_id: string
  option_id: string | null
  text_value: string | null
  scale_value: number | null
}

export function listMyAnswers(db: D1Database, submissionId: string): Promise<MyAnswerRow[]> {
  return all<MyAnswerRow>(
    db
      .prepare(
        `SELECT question_id, option_id, text_value, scale_value
           FROM survey_answers WHERE submission_id = ?`,
      )
      .bind(submissionId),
  )
}
