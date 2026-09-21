import { LOGIN_RATE_LIMIT } from '../../shared/constants'
import { count, first } from '../db/client'
import { rateLimited } from './errors'
import { newId } from './crypto'

/**
 * Limitacion de fuerza bruta con ventana deslizante sobre D1.
 *
 * Se resuelve dentro de Cloudflare sin servicios externos ni Durable Objects,
 * para que el sistema siga cabiendo en el plan gratuito. Son dos o tres
 * consultas muy indexadas por intento de login, no por peticion.
 */

const windowStart = (now: Date): string =>
  new Date(now.getTime() - LOGIN_RATE_LIMIT.windowMinutes * 60_000).toISOString()

async function failuresSince(
  db: D1Database,
  column: 'identifier' | 'ip',
  value: string,
  since: string,
): Promise<number> {
  return count(
    db
      .prepare(
        'SELECT COUNT(*) AS value FROM login_attempts WHERE ' +
          column +
          ' = ? AND success = 0 AND created_at > ?',
      )
      .bind(value, since),
  )
}

async function oldestFailure(
  db: D1Database,
  column: 'identifier' | 'ip',
  value: string,
  since: string,
): Promise<string | null> {
  const row = await first<{ created_at: string }>(
    db
      .prepare(
        'SELECT created_at FROM login_attempts WHERE ' +
          column +
          ' = ? AND success = 0 AND created_at > ? ORDER BY created_at ASC LIMIT 1',
      )
      .bind(value, since),
  )
  return row?.created_at ?? null
}

/** Segundos que faltan para que el intento mas antiguo salga de la ventana. */
function retryAfterSeconds(oldest: string | null, now: Date): number {
  if (!oldest) return LOGIN_RATE_LIMIT.lockoutMinutes * 60
  const unlockAt = Date.parse(oldest) + LOGIN_RATE_LIMIT.windowMinutes * 60_000
  return Math.max(30, Math.ceil((unlockAt - now.getTime()) / 1000))
}

/**
 * Lanza 429 si el usuario o la IP han superado el limite de intentos fallidos.
 * Se comprueba ANTES de verificar la contrasena, para no dar ninguna pista
 * sobre si la cuenta existe.
 */
export async function assertLoginAllowed(
  db: D1Database,
  identifier: string,
  ip: string,
  now: Date,
): Promise<void> {
  const since = windowStart(now)

  const identifierFailures = await failuresSince(db, 'identifier', identifier, since)
  if (identifierFailures >= LOGIN_RATE_LIMIT.maxAttemptsPerIdentifier) {
    const oldest = await oldestFailure(db, 'identifier', identifier, since)
    throw rateLimited(
      'Demasiados intentos fallidos. Vuelve a intentarlo en unos minutos o contacta con el administrador.',
      retryAfterSeconds(oldest, now),
    )
  }

  if (ip !== 'unknown') {
    const ipFailures = await failuresSince(db, 'ip', ip, since)
    if (ipFailures >= LOGIN_RATE_LIMIT.maxAttemptsPerIp) {
      const oldest = await oldestFailure(db, 'ip', ip, since)
      throw rateLimited(
        'Demasiados intentos fallidos desde esta red. Vuelve a intentarlo mas tarde.',
        retryAfterSeconds(oldest, now),
      )
    }
  }
}

export async function recordLoginAttempt(
  db: D1Database,
  input: { identifier: string; ip: string; success: boolean; now: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO login_attempts (id, identifier, ip, success, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(newId(), input.identifier, input.ip, input.success ? 1 : 0, input.now)
    .run()
}

/** Tras un login correcto se limpia el contador del usuario. */
export async function clearLoginFailures(db: D1Database, identifier: string): Promise<void> {
  await db
    .prepare('DELETE FROM login_attempts WHERE identifier = ? AND success = 0')
    .bind(identifier)
    .run()
}

/** Purga periodica (cron) para que la tabla no crezca sin control. */
export async function cleanupLoginAttempts(db: D1Database, cutoff: string): Promise<number> {
  const result = await db.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(cutoff).run()
  return result.meta.changes ?? 0
}
