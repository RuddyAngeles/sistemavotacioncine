import type { Context } from 'hono'
import type { AuditAction } from '../../shared/constants'
import { insertAuditLog } from '../db/audit'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { clientIp, nowIso, userAgent } from '../lib/http'

export interface AuditInput {
  action: AuditAction
  entity: 'user' | 'poll' | 'option' | 'vote' | 'media' | 'session' | 'participation'
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  /** Para el login fallido, donde todavia no hay usuario en el contexto. */
  actor?: { id: string | null; username: string | null }
}

/**
 * Registra una accion en `audit_logs`.
 *
 * Se espera a que termine (no se delega a `waitUntil`) porque el registro de
 * auditoria forma parte del resultado de la operacion: si no se puede
 * auditar, preferimos enterarnos.
 */
export async function recordAudit(c: Context<AppEnv>, input: AuditInput): Promise<void> {
  const user = c.get('user')
  const actorId = input.actor ? input.actor.id : (user?.id ?? null)
  const actorUsername = input.actor ? input.actor.username : (user?.username ?? null)

  await insertAuditLog(c.env.DB, {
    id: newId(),
    actorId,
    actorUsername,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: clientIp(c),
    userAgent: userAgent(c),
    now: nowIso(),
  })
}

/** Variante para procesos sin peticion HTTP (cron triggers). */
export async function recordSystemAudit(
  db: D1Database,
  input: {
    action: AuditAction
    entity: AuditInput['entity']
    entityId?: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<void> {
  await insertAuditLog(db, {
    id: newId(),
    actorId: null,
    actorUsername: 'sistema',
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: null,
    userAgent: null,
    now: nowIso(),
  })
}
