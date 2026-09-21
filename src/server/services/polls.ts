import type { Context } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import {
  canTransition,
  resolveEffectiveStatus,
  targetStatus,
  type PollTransition,
} from '../../shared/policy'
import type { PollStatus } from '../../shared/types'
import { countOptions, copyOptions } from '../db/options'
import {
  findPollById,
  insertPoll,
  listSchedulablePolls,
  slugExists,
  toRuleState,
  updatePollStatus,
  type PollRow,
} from '../db/polls'
import { fromBool } from '../db/client'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, notFound, validationError } from '../lib/errors'
import { nowIso } from '../lib/http'
import { uniqueSlug } from '../lib/slug'
import { recordAudit, recordSystemAudit } from './audit'

/**
 * Sincroniza el estado guardado con el estado real segun la programacion.
 *
 * Se llama de forma perezosa cada vez que se lee una votacion, ademas del
 * cron cada 5 minutos. De este modo una votacion programada para las 10:00
 * esta abierta a las 10:00:01 para quien entre, sin esperar al cron, y sin
 * tener que consultar relojes en el frontend.
 */
export async function syncPollStatus(
  db: D1Database,
  poll: PollRow,
  now: Date = new Date(),
): Promise<PollRow> {
  const effective = resolveEffectiveStatus(toRuleState(poll), now)
  if (effective === poll.status) return poll

  const iso = now.toISOString()

  if (effective === 'ACTIVE') {
    await updatePollStatus(db, poll.id, 'ACTIVE', { openedAt: poll.opened_at ?? iso }, iso)
    await recordSystemAudit(db, {
      action: AUDIT_ACTIONS.POLL_AUTO_OPENED,
      entity: 'poll',
      entityId: poll.id,
      metadata: { startsAt: poll.starts_at },
    })
    return { ...poll, status: 'ACTIVE', opened_at: poll.opened_at ?? iso, updated_at: iso }
  }

  if (effective === 'CLOSED') {
    await updatePollStatus(db, poll.id, 'CLOSED', { closedAt: iso }, iso)
    await recordSystemAudit(db, {
      action: AUDIT_ACTIONS.POLL_AUTO_CLOSED,
      entity: 'poll',
      entityId: poll.id,
      metadata: { endsAt: poll.ends_at },
    })
    return { ...poll, status: 'CLOSED', closed_at: iso, updated_at: iso }
  }

  return poll
}

/** Barrido completo ejecutado por el cron trigger. */
export async function syncScheduledPolls(
  db: D1Database,
  now: Date = new Date(),
): Promise<{ opened: number; closed: number }> {
  const candidates = await listSchedulablePolls(db)
  let opened = 0
  let closed = 0

  for (const poll of candidates) {
    const before = poll.status
    const after = await syncPollStatus(db, poll, now)
    if (after.status === before) continue
    if (after.status === 'ACTIVE') opened += 1
    if (after.status === 'CLOSED') closed += 1
  }

  return { opened, closed }
}

const AUDIT_BY_TRANSITION: Record<PollTransition, (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]> = {
  publish: AUDIT_ACTIONS.POLL_PUBLISHED,
  open: AUDIT_ACTIONS.POLL_OPENED,
  close: AUDIT_ACTIONS.POLL_CLOSED,
  archive: AUDIT_ACTIONS.POLL_ARCHIVED,
  reopen: AUDIT_ACTIONS.POLL_REOPENED,
  'back-to-draft': AUDIT_ACTIONS.POLL_UPDATED,
}

/**
 * Aplica una transicion manual del administrador.
 *
 * El control es explicito: guardar, publicar, abrir, cerrar y archivar son
 * acciones separadas. La programacion horaria es opcional y complementaria.
 */
export async function applyTransition(
  c: Context<AppEnv>,
  poll: PollRow,
  transition: PollTransition,
): Promise<PollRow> {
  const db = c.env.DB

  if (!canTransition(poll.status, transition)) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'La votacion esta en estado ' + poll.status + ' y no admite esta accion',
    )
  }

  // Publicar o abrir sin peliculas no tiene sentido: los trabajadores
  // encontrarian una votacion vacia.
  if (transition === 'publish' || transition === 'open') {
    const options = await countOptions(db, poll.id)
    if (options === 0) {
      throw new AppError(
        409,
        ERROR_CODES.POLL_HAS_NO_OPTIONS,
        'Agrega al menos una pelicula antes de publicar o abrir la votacion',
      )
    }
  }

  const now = new Date()
  const iso = now.toISOString()
  let status: PollStatus = targetStatus(transition)
  const stamps: Parameters<typeof updatePollStatus>[3] = {}
  let auditAction = AUDIT_BY_TRANSITION[transition]

  switch (transition) {
    case 'publish': {
      stamps.publishedAt = poll.published_at ?? iso
      // Con fecha de inicio futura la votacion queda PROGRAMADA y se abrira sola.
      if (poll.starts_at && Date.parse(poll.starts_at) > now.getTime()) {
        status = 'SCHEDULED'
        auditAction = AUDIT_ACTIONS.POLL_SCHEDULED
      }
      break
    }
    case 'open': {
      if (poll.ends_at && Date.parse(poll.ends_at) <= now.getTime()) {
        throw validationError(
          'La fecha de finalizacion ya ha pasado. Actualiza la programacion antes de abrir la votacion.',
        )
      }
      stamps.openedAt = iso
      stamps.closedAt = null
      stamps.publishedAt = poll.published_at ?? iso
      break
    }
    case 'close': {
      stamps.closedAt = iso
      break
    }
    case 'archive': {
      stamps.archivedAt = iso
      if (!poll.closed_at) stamps.closedAt = iso
      break
    }
    case 'reopen': {
      stamps.archivedAt = null
      break
    }
    case 'back-to-draft': {
      stamps.publishedAt = null
      break
    }
  }

  await updatePollStatus(db, poll.id, status, stamps, iso)
  await recordAudit(c, {
    action: auditAction,
    entity: 'poll',
    entityId: poll.id,
    metadata: { from: poll.status, to: status, transition },
  })

  const updated = await findPollById(db, poll.id)
  if (!updated) throw notFound('La votacion ya no existe')
  return updated
}

/**
 * Duplica una votacion como plantilla.
 *
 * Copia titulo, descripcion, configuracion y peliculas.
 * NO copia votos, participantes, resultados ni estado: la copia nace en DRAFT.
 */
export async function duplicatePoll(
  c: Context<AppEnv>,
  source: PollRow,
  title?: string,
): Promise<PollRow> {
  const db = c.env.DB
  const iso = nowIso()
  const newTitle = title ?? source.title + ' (copia)'
  const id = newId()
  const slug = await uniqueSlug(newTitle, (candidate) => slugExists(db, candidate))

  await insertPoll(db, {
    id,
    slug,
    title: newTitle,
    description: source.description,
    kind: source.kind,
    allowVoteChange: fromBool(source.allow_vote_change),
    showLiveResults: fromBool(source.show_live_results),
    showResultsAfterClose: fromBool(source.show_results_after_close),
    allowNotAttending: fromBool(source.allow_not_attending),
    // La programacion no se copia: las fechas del original ya no aplican.
    startsAt: null,
    endsAt: null,
    createdBy: c.get('user')?.id ?? '',
    now: iso,
  })

  const copied = await copyOptions(db, source.id, id, newId, iso)

  await recordAudit(c, {
    action: AUDIT_ACTIONS.POLL_DUPLICATED,
    entity: 'poll',
    entityId: id,
    metadata: { sourcePollId: source.id, sourceTitle: source.title, optionsCopied: copied },
  })

  const created = await findPollById(db, id)
  if (!created) throw notFound('No se pudo crear la copia')
  return created
}

/** Carga una votacion por id y sincroniza su estado programado. */
export async function loadPoll(db: D1Database, id: string): Promise<PollRow> {
  const poll = await findPollById(db, id)
  if (!poll) throw notFound('La votacion no existe')
  return syncPollStatus(db, poll)
}
