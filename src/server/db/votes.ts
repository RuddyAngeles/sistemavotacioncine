import type { Role } from '../../shared/types'
import { all, count, first, fromBool } from './client'

export interface VoteRow {
  id: string
  poll_id: string
  user_id: string
  /** NULL cuando la persona ha respondido que no asiste. */
  option_id: string | null
  attending: number
  change_count: number
  created_at: string
  updated_at: string
}

const COLUMNS = 'id, poll_id, user_id, option_id, attending, change_count, created_at, updated_at'

export function findVote(db: D1Database, pollId: string, userId: string): Promise<VoteRow | null> {
  return first<VoteRow>(
    db
      .prepare('SELECT ' + COLUMNS + ' FROM votes WHERE poll_id = ? AND user_id = ?')
      .bind(pollId, userId),
  )
}

/**
 * Inserta el voto. Si el usuario ya voto, la restriccion
 * UNIQUE (poll_id, user_id) hace fallar la sentencia: es la base de datos,
 * no la aplicacion, quien garantiza "un usuario = un voto".
 *
 * `optionId = null` representa "no asistire"; el CHECK de la tabla impide
 * cualquier combinacion incoherente.
 */
export async function insertVote(
  db: D1Database,
  input: {
    id: string
    pollId: string
    userId: string
    optionId: string | null
    now: string
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO votes (id, poll_id, user_id, option_id, attending, change_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      input.id,
      input.pollId,
      input.userId,
      input.optionId,
      input.optionId === null ? 0 : 1,
      input.now,
      input.now,
    )
    .run()
}

/**
 * Cambia la respuesta del voto existente: otra pelicula, o pasar de asistir
 * a no asistir y viceversa. Nunca crea una fila nueva.
 */
export async function updateVoteChoice(
  db: D1Database,
  voteId: string,
  optionId: string | null,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE votes
          SET option_id = ?, attending = ?, change_count = change_count + 1, updated_at = ?
        WHERE id = ?`,
    )
    .bind(optionId, optionId === null ? 0 : 1, now, voteId)
    .run()
}

export function countVotes(db: D1Database, pollId: string): Promise<number> {
  return count(db.prepare('SELECT COUNT(*) AS value FROM votes WHERE poll_id = ?').bind(pollId))
}

export interface AttendanceCounts {
  attending: number
  notAttending: number
}

/**
 * Cuantos asisten y cuantos no.
 *
 * `attending` es directamente el numero de entradas que hay que comprar.
 */
export async function countAttendance(
  db: D1Database,
  pollId: string,
): Promise<AttendanceCounts> {
  const row = await first<{ attending: number; not_attending: number }>(
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN attending = 1 THEN 1 ELSE 0 END) AS attending,
           SUM(CASE WHEN attending = 0 THEN 1 ELSE 0 END) AS not_attending
         FROM votes WHERE poll_id = ?`,
      )
      .bind(pollId),
  )

  return {
    attending: row?.attending ?? 0,
    notAttending: row?.not_attending ?? 0,
  }
}

export interface TallyRow {
  option_id: string
  votes: number
}

/** Recuento por pelicula, incluyendo las que tienen cero votos. */
export function tallyVotes(db: D1Database, pollId: string): Promise<TallyRow[]> {
  return all<TallyRow>(
    db
      .prepare(
        `SELECT o.id AS option_id, COUNT(v.id) AS votes
           FROM poll_options o
           LEFT JOIN votes v
             ON v.option_id = o.id AND v.poll_id = o.poll_id AND v.attending = 1
          WHERE o.poll_id = ?
          GROUP BY o.id`,
      )
      .bind(pollId),
  )
}

export interface ParticipationRow {
  user_id: string
  name: string
  username: string
  role: Role
  attending: number | null
  option_id: string | null
  option_title: string | null
  voted_at: string | null
  last_changed_at: string | null
}

/**
 * Estado de participacion de cada usuario elegible.
 *
 * Devuelve tambien la eleccion individual: la ruta que la expone es
 * exclusiva de administradores, exige pedirla de forma explicita y queda
 * registrada en la auditoria.
 */
export function participationRows(db: D1Database, pollId: string): Promise<ParticipationRow[]> {
  return all<ParticipationRow>(
    db
      .prepare(
        `SELECT u.id          AS user_id,
                u.name        AS name,
                u.username    AS username,
                u.role        AS role,
                v.attending   AS attending,
                v.option_id   AS option_id,
                o.title       AS option_title,
                v.created_at  AS voted_at,
                v.updated_at  AS last_changed_at
           FROM users u
           LEFT JOIN votes v ON v.user_id = u.id AND v.poll_id = ?
           LEFT JOIN poll_options o ON o.id = v.option_id
          WHERE u.status = 'ACTIVE'
          ORDER BY (v.id IS NULL) ASC, u.name COLLATE NOCASE ASC`,
      )
      .bind(pollId),
  )
}

/** Traduce el 0/1/NULL de la columna `attending` al tri-estado del DTO. */
export function attendanceOf(row: ParticipationRow): boolean | null {
  if (row.attending === null) return null
  return fromBool(row.attending)
}

/**
 * Participacion media de las votaciones ya terminadas, en tanto por uno.
 * Se calcula sobre el numero de usuarios activos actual, que es la mejor
 * aproximacion disponible sin guardar un censo por votacion.
 */
export async function averageParticipation(db: D1Database): Promise<number> {
  const row = await first<{ polls: number; votes: number }>(
    db.prepare(
      `SELECT COUNT(DISTINCT p.id) AS polls,
              (SELECT COUNT(*) FROM votes v
                 JOIN polls p2 ON p2.id = v.poll_id
                WHERE p2.status IN ('CLOSED', 'ARCHIVED')) AS votes
         FROM polls p
        WHERE p.status IN ('CLOSED', 'ARCHIVED')`,
    ),
  )
  const eligible = await count(
    db.prepare("SELECT COUNT(*) AS value FROM users WHERE status = 'ACTIVE'"),
  )

  const polls = row?.polls ?? 0
  const votes = row?.votes ?? 0
  if (polls === 0 || eligible === 0) return 0
  return votes / (polls * eligible)
}
