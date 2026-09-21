import type { PollDTO, PollKind, PollStatus } from '../../shared/types'
import type { PollRuleState } from '../../shared/policy'
import { all, bool, buildUpdate, count, first, fromBool } from './client'

export interface PollRow {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PollKind
  status: PollStatus
  allow_vote_change: number
  show_live_results: number
  show_results_after_close: number
  allow_not_attending: number
  starts_at: string | null
  ends_at: string | null
  published_at: string | null
  opened_at: string | null
  closed_at: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  option_count: number
  total_votes: number
}

export function toPollDTO(row: PollRow): PollDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    status: row.status,
    allowVoteChange: fromBool(row.allow_vote_change),
    showLiveResults: fromBool(row.show_live_results),
    showResultsAfterClose: fromBool(row.show_results_after_close),
    allowNotAttending: fromBool(row.allow_not_attending),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publishedAt: row.published_at,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    optionCount: row.option_count ?? 0,
    totalVotes: row.total_votes ?? 0,
  }
}

/** Proyeccion que consumen las reglas puras de `shared/policy`. */
export function toRuleState(row: PollRow): PollRuleState {
  return {
    status: row.status,
    allowVoteChange: fromBool(row.allow_vote_change),
    showLiveResults: fromBool(row.show_live_results),
    showResultsAfterClose: fromBool(row.show_results_after_close),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

const SELECT_POLL = `
  SELECT p.id, p.slug, p.title, p.description, p.kind, p.status,
         p.allow_vote_change, p.show_live_results, p.show_results_after_close,
         p.allow_not_attending,
         p.starts_at, p.ends_at, p.published_at, p.opened_at, p.closed_at, p.archived_at,
         p.created_by, p.created_at, p.updated_at,
         (SELECT COUNT(*) FROM poll_options o WHERE o.poll_id = p.id) AS option_count,
         (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) AS total_votes
    FROM polls p`

export function findPollById(db: D1Database, id: string): Promise<PollRow | null> {
  return first<PollRow>(db.prepare(SELECT_POLL + ' WHERE p.id = ?').bind(id))
}

export function findPollBySlug(db: D1Database, slug: string): Promise<PollRow | null> {
  return first<PollRow>(db.prepare(SELECT_POLL + ' WHERE p.slug = ?').bind(slug))
}

export async function slugExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    db.prepare('SELECT id FROM polls WHERE slug = ?').bind(slug),
  )
  return row !== null
}

export interface InsertPollInput {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PollKind
  allowVoteChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
  allowNotAttending: boolean
  startsAt: string | null
  endsAt: string | null
  createdBy: string
  now: string
}

export async function insertPoll(db: D1Database, input: InsertPollInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO polls (id, slug, title, description, kind, status,
         allow_vote_change, show_live_results, show_results_after_close, allow_not_attending,
         starts_at, ends_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.slug,
      input.title,
      input.description,
      input.kind,
      bool(input.allowVoteChange),
      bool(input.showLiveResults),
      bool(input.showResultsAfterClose),
      bool(input.allowNotAttending),
      input.startsAt,
      input.endsAt,
      input.createdBy,
      input.now,
      input.now,
    )
    .run()
}

export interface UpdatePollPatch {
  title?: string | undefined
  description?: string | null | undefined
  kind?: PollKind | undefined
  allowVoteChange?: boolean | undefined
  showLiveResults?: boolean | undefined
  showResultsAfterClose?: boolean | undefined
  allowNotAttending?: boolean | undefined
  startsAt?: string | null | undefined
  endsAt?: string | null | undefined
}

export async function updatePoll(
  db: D1Database,
  id: string,
  patch: UpdatePollPatch,
  now: string,
): Promise<void> {
  const { clause, values } = buildUpdate({
    title: patch.title,
    description: patch.description,
    kind: patch.kind,
    allow_vote_change: patch.allowVoteChange === undefined ? undefined : bool(patch.allowVoteChange),
    show_live_results: patch.showLiveResults === undefined ? undefined : bool(patch.showLiveResults),
    show_results_after_close:
      patch.showResultsAfterClose === undefined ? undefined : bool(patch.showResultsAfterClose),
    allow_not_attending:
      patch.allowNotAttending === undefined ? undefined : bool(patch.allowNotAttending),
    starts_at: patch.startsAt,
    ends_at: patch.endsAt,
    updated_at: now,
  })
  if (values.length === 0) return
  await db
    .prepare('UPDATE polls SET ' + clause + ' WHERE id = ?')
    .bind(...values, id)
    .run()
}

/** Cambia el estado y sella la marca de tiempo correspondiente. */
export async function updatePollStatus(
  db: D1Database,
  id: string,
  status: PollStatus,
  stamps: {
    publishedAt?: string | null
    openedAt?: string | null
    closedAt?: string | null
    archivedAt?: string | null
  },
  now: string,
): Promise<void> {
  const { clause, values } = buildUpdate({
    status,
    published_at: stamps.publishedAt,
    opened_at: stamps.openedAt,
    closed_at: stamps.closedAt,
    archived_at: stamps.archivedAt,
    updated_at: now,
  })
  await db
    .prepare('UPDATE polls SET ' + clause + ' WHERE id = ?')
    .bind(...values, id)
    .run()
}

export async function deletePoll(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM polls WHERE id = ?').bind(id).run()
}

export interface ListPollsFilters {
  q?: string | undefined
  status?: PollStatus | undefined
  scope: 'all' | 'live' | 'history'
  page: number
  pageSize: number
}

export async function listPolls(
  db: D1Database,
  filters: ListPollsFilters,
): Promise<{ items: PollRow[]; total: number }> {
  const where: string[] = []
  const params: Array<string | number> = []

  const search = filters.q?.trim().toLowerCase()
  if (search) {
    where.push('LOWER(p.title) LIKE ?')
    params.push('%' + search + '%')
  }
  if (filters.status) {
    where.push('p.status = ?')
    params.push(filters.status)
  }
  if (filters.scope === 'history') {
    where.push("p.status IN ('CLOSED', 'ARCHIVED')")
  } else if (filters.scope === 'live') {
    where.push("p.status <> 'ARCHIVED'")
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''
  const offset = (filters.page - 1) * filters.pageSize

  const total = await count(
    db.prepare('SELECT COUNT(*) AS value FROM polls p' + whereClause).bind(...params),
  )

  const items = await all<PollRow>(
    db
      .prepare(
        SELECT_POLL +
          whereClause +
          ` ORDER BY CASE p.status
                       WHEN 'ACTIVE' THEN 0
                       WHEN 'SCHEDULED' THEN 1
                       WHEN 'PUBLISHED' THEN 2
                       WHEN 'DRAFT' THEN 3
                       WHEN 'CLOSED' THEN 4
                       ELSE 5
                     END,
                     p.created_at DESC
             LIMIT ? OFFSET ?`,
      )
      .bind(...params, filters.pageSize, offset),
  )

  return { items, total }
}

/** Votaciones visibles para un trabajador: todo lo que ya no es borrador. */
export function listVisiblePolls(db: D1Database): Promise<PollRow[]> {
  return all<PollRow>(
    db.prepare(
      SELECT_POLL +
        ` WHERE p.status <> 'DRAFT'
          ORDER BY CASE p.status
                     WHEN 'ACTIVE' THEN 0
                     WHEN 'SCHEDULED' THEN 1
                     WHEN 'PUBLISHED' THEN 2
                     WHEN 'CLOSED' THEN 3
                     ELSE 4
                   END,
                   p.created_at DESC
          LIMIT 100`,
    ),
  )
}

/**
 * Candidatas a estar abiertas ahora mismo.
 *
 * Incluye las ya marcadas como ACTIVE y las programadas cuya hora de inicio
 * ya paso (todavia sin sincronizar). Son pocas filas y el indice por estado
 * las resuelve rapido, que importa porque esta consulta la dispara el enlace
 * fijo que usan todos los empleados.
 */
export function listActiveCandidates(db: D1Database, now: string): Promise<PollRow[]> {
  return all<PollRow>(
    db
      .prepare(
        SELECT_POLL +
          ` WHERE p.status = 'ACTIVE'
               OR (p.status = 'SCHEDULED' AND p.starts_at IS NOT NULL AND p.starts_at <= ?)
             ORDER BY COALESCE(p.opened_at, p.starts_at) DESC
             LIMIT 10`,
      )
      .bind(now),
  )
}

/** Votaciones candidatas a abrirse o cerrarse solas (cron + acceso perezoso). */
export function listSchedulablePolls(db: D1Database): Promise<PollRow[]> {
  return all<PollRow>(
    db.prepare(
      SELECT_POLL +
        ` WHERE (p.status = 'SCHEDULED' AND p.starts_at IS NOT NULL)
             OR (p.status IN ('ACTIVE', 'SCHEDULED', 'PUBLISHED') AND p.ends_at IS NOT NULL)
           LIMIT 200`,
    ),
  )
}

export type PollStatusCounts = Record<PollStatus, number> & { total: number }

export async function pollStatusCounts(db: D1Database): Promise<PollStatusCounts> {
  const rows = await all<{ status: PollStatus; value: number }>(
    db.prepare('SELECT status, COUNT(*) AS value FROM polls GROUP BY status'),
  )

  const counts: PollStatusCounts = {
    total: 0,
    DRAFT: 0,
    SCHEDULED: 0,
    PUBLISHED: 0,
    ACTIVE: 0,
    CLOSED: 0,
    ARCHIVED: 0,
  }

  for (const row of rows) {
    counts[row.status] = row.value
    counts.total += row.value
  }
  return counts
}

export function listActivePolls(db: D1Database): Promise<PollRow[]> {
  return all<PollRow>(
    db.prepare(SELECT_POLL + " WHERE p.status = 'ACTIVE' ORDER BY p.opened_at DESC LIMIT 10"),
  )
}

export function listRecentPolls(db: D1Database, limit: number): Promise<PollRow[]> {
  return all<PollRow>(db.prepare(SELECT_POLL + ' ORDER BY p.created_at DESC LIMIT ?').bind(limit))
}
