import type { AuditLogDTO } from '../../shared/types'
import { all, count } from './client'

export interface AuditLogRow {
  id: string
  actor_id: string | null
  actor_username: string | null
  action: string
  entity: string
  entity_id: string | null
  metadata: string | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export function toAuditLogDTO(row: AuditLogRow): AuditLogDTO {
  let metadata: Record<string, unknown> | null = null
  if (row.metadata) {
    try {
      const parsed: unknown = JSON.parse(row.metadata)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>
      }
    } catch {
      metadata = null
    }
  }

  return {
    id: row.id,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    metadata,
    ip: row.ip,
    createdAt: row.created_at,
  }
}

export interface InsertAuditLogInput {
  id: string
  actorId: string | null
  actorUsername: string | null
  action: string
  entity: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  now: string
}

export async function insertAuditLog(db: D1Database, input: InsertAuditLogInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_username, action, entity, entity_id,
         metadata, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.actorId,
      input.actorUsername,
      input.action,
      input.entity,
      input.entityId,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip,
      input.userAgent,
      input.now,
    )
    .run()
}

export interface ListAuditFilters {
  action?: string | undefined
  entity?: string | undefined
  actorId?: string | undefined
  page: number
  pageSize: number
}

export async function listAuditLogs(
  db: D1Database,
  filters: ListAuditFilters,
): Promise<{ items: AuditLogRow[]; total: number }> {
  const where: string[] = []
  const params: Array<string | number> = []

  if (filters.action) {
    where.push('action = ?')
    params.push(filters.action)
  }
  if (filters.entity) {
    where.push('entity = ?')
    params.push(filters.entity)
  }
  if (filters.actorId) {
    where.push('actor_id = ?')
    params.push(filters.actorId)
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''
  const offset = (filters.page - 1) * filters.pageSize

  const total = await count(
    db.prepare('SELECT COUNT(*) AS value FROM audit_logs' + whereClause).bind(...params),
  )

  const items = await all<AuditLogRow>(
    db
      .prepare(
        `SELECT id, actor_id, actor_username, action, entity, entity_id, metadata, ip, user_agent, created_at
           FROM audit_logs` +
          whereClause +
          ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .bind(...params, filters.pageSize, offset),
  )

  return { items, total }
}

/** Retencion: la auditoria no debe crecer sin limite en el plan gratuito. */
export async function deleteAuditLogsBefore(db: D1Database, cutoff: string): Promise<number> {
  const result = await db.prepare('DELETE FROM audit_logs WHERE created_at < ?').bind(cutoff).run()
  return result.meta.changes ?? 0
}
