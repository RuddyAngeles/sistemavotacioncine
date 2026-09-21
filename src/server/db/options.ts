import type { PollOptionDTO } from '../../shared/types'
import { all, buildUpdate, count, first } from './client'

export interface PollOptionRow {
  id: string
  poll_id: string
  title: string
  description: string | null
  genre: string | null
  year: number | null
  duration_minutes: number | null
  showtime: string | null
  poster_key: string | null
  position: number
  created_at: string
  updated_at: string
}

/**
 * Las carteleras viven en R2 y se sirven por el Worker, que exige sesion.
 * Por eso la URL publica es `/api/media/<key>` y no una URL directa de R2.
 */
export function posterUrl(posterKey: string | null): string | null {
  if (!posterKey) return null
  return '/api/media/' + posterKey
}

export function toOptionDTO(row: PollOptionRow): PollOptionDTO {
  return {
    id: row.id,
    pollId: row.poll_id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    year: row.year,
    durationMinutes: row.duration_minutes,
    showtime: row.showtime,
    posterUrl: posterUrl(row.poster_key),
    posterKey: row.poster_key,
    position: row.position,
  }
}

const COLUMNS = [
  'id',
  'poll_id',
  'title',
  'description',
  'genre',
  'year',
  'duration_minutes',
  'showtime',
  'poster_key',
  'position',
  'created_at',
  'updated_at',
].join(', ')

export function listOptions(db: D1Database, pollId: string): Promise<PollOptionRow[]> {
  return all<PollOptionRow>(
    db
      .prepare(
        'SELECT ' +
          COLUMNS +
          ' FROM poll_options WHERE poll_id = ? ORDER BY position ASC, created_at ASC',
      )
      .bind(pollId),
  )
}

export function findOption(
  db: D1Database,
  pollId: string,
  optionId: string,
): Promise<PollOptionRow | null> {
  return first<PollOptionRow>(
    db
      .prepare('SELECT ' + COLUMNS + ' FROM poll_options WHERE id = ? AND poll_id = ?')
      .bind(optionId, pollId),
  )
}

export function countOptions(db: D1Database, pollId: string): Promise<number> {
  return count(
    db.prepare('SELECT COUNT(*) AS value FROM poll_options WHERE poll_id = ?').bind(pollId),
  )
}

export async function nextPosition(db: D1Database, pollId: string): Promise<number> {
  const row = await first<{ value: number | null }>(
    db.prepare('SELECT MAX(position) AS value FROM poll_options WHERE poll_id = ?').bind(pollId),
  )
  return (row?.value ?? -1) + 1
}

export interface InsertOptionInput {
  id: string
  pollId: string
  title: string
  description: string | null
  genre: string | null
  year: number | null
  durationMinutes: number | null
  showtime: string | null
  posterKey: string | null
  position: number
  now: string
}

export async function insertOption(db: D1Database, input: InsertOptionInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO poll_options (id, poll_id, title, description, genre, year,
         duration_minutes, showtime, poster_key, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.pollId,
      input.title,
      input.description,
      input.genre,
      input.year,
      input.durationMinutes,
      input.showtime,
      input.posterKey,
      input.position,
      input.now,
      input.now,
    )
    .run()
}

export interface UpdateOptionPatch {
  title?: string | undefined
  description?: string | null | undefined
  genre?: string | null | undefined
  year?: number | null | undefined
  durationMinutes?: number | null | undefined
  showtime?: string | null | undefined
  posterKey?: string | null | undefined
}

export async function updateOption(
  db: D1Database,
  optionId: string,
  patch: UpdateOptionPatch,
  now: string,
): Promise<void> {
  const { clause, values } = buildUpdate({
    title: patch.title,
    description: patch.description,
    genre: patch.genre,
    year: patch.year,
    duration_minutes: patch.durationMinutes,
    showtime: patch.showtime,
    poster_key: patch.posterKey,
    updated_at: now,
  })
  if (values.length === 0) return
  await db
    .prepare('UPDATE poll_options SET ' + clause + ' WHERE id = ?')
    .bind(...values, optionId)
    .run()
}

export async function deleteOption(db: D1Database, optionId: string): Promise<void> {
  await db.prepare('DELETE FROM poll_options WHERE id = ?').bind(optionId).run()
}

/**
 * Reordena en lote. D1 ejecuta el array como una unica transaccion implicita,
 * asi que o se aplica el orden completo o no se aplica nada.
 */
export async function reorderOptions(
  db: D1Database,
  pollId: string,
  orderedIds: string[],
  now: string,
): Promise<void> {
  if (orderedIds.length === 0) return

  const statement = db.prepare(
    'UPDATE poll_options SET position = ?, updated_at = ? WHERE id = ? AND poll_id = ?',
  )
  await db.batch(
    orderedIds.map((optionId, index) => statement.bind(index, now, optionId, pollId)),
  )
}

/** Copia las opciones de una votacion a otra (duplicar votacion). */
export async function copyOptions(
  db: D1Database,
  sourcePollId: string,
  targetPollId: string,
  newId: () => string,
  now: string,
): Promise<number> {
  const options = await listOptions(db, sourcePollId)
  if (options.length === 0) return 0

  const statement = db.prepare(
    `INSERT INTO poll_options (id, poll_id, title, description, genre, year,
       duration_minutes, showtime, poster_key, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  await db.batch(
    options.map((option, index) =>
      statement.bind(
        newId(),
        targetPollId,
        option.title,
        option.description,
        option.genre,
        option.year,
        option.duration_minutes,
        option.showtime,
        option.poster_key,
        index,
        now,
        now,
      ),
    ),
  )

  return options.length
}
