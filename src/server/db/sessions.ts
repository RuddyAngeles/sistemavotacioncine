import type { Role, UserStatus } from '../../shared/types'
import { first } from './client'

export interface SessionRow {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  last_seen_at: string
  ip: string | null
  user_agent: string | null
}

/** Sesion + usuario en una sola consulta: es la ruta caliente de cada peticion. */
export interface SessionWithUserRow {
  session_id: string
  expires_at: string
  last_seen_at: string
  user_id: string
  name: string
  username: string
  role: Role
  status: UserStatus
  must_change_password: number
  can_answer_surveys: number
}

export async function insertSession(
  db: D1Database,
  input: {
    id: string
    userId: string
    createdAt: string
    expiresAt: string
    ip: string | null
    userAgent: string | null
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.userId,
      input.createdAt,
      input.expiresAt,
      input.createdAt,
      input.ip,
      input.userAgent,
    )
    .run()
}

export function findSessionWithUser(
  db: D1Database,
  sessionId: string,
  now: string,
): Promise<SessionWithUserRow | null> {
  return first<SessionWithUserRow>(
    db
      .prepare(
        `SELECT s.id           AS session_id,
                s.expires_at   AS expires_at,
                s.last_seen_at AS last_seen_at,
                u.id           AS user_id,
                u.name         AS name,
                u.username     AS username,
                u.role         AS role,
                u.status       AS status,
                u.must_change_password AS must_change_password,
                u.can_answer_surveys   AS can_answer_surveys
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > ?`,
      )
      .bind(sessionId, now),
  )
}

export async function touchSession(db: D1Database, sessionId: string, now: string): Promise<void> {
  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, sessionId).run()
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
}

/**
 * Invalida todas las sesiones de un usuario.
 * Se usa al desactivarlo, al eliminarlo y al cambiar su contrasena: el acceso
 * se corta al instante, no cuando caduque la cookie.
 */
export async function deleteSessionsForUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
}

export async function deleteExpiredSessions(db: D1Database, now: string): Promise<number> {
  const result = await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run()
  return result.meta.changes ?? 0
}
