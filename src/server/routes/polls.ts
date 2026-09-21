import { Hono } from 'hono'
import type { Handler } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import { areOptionsEditable, isPollEditable, type PollTransition } from '../../shared/policy'
import {
  createOptionSchema,
  createPollSchema,
  duplicatePollSchema,
  listPollsQuerySchema,
  reorderOptionsSchema,
  updateOptionSchema,
  updatePollSchema,
} from '../../shared/schemas'
import type { PaginatedDTO, PollDTO, PollDetailDTO } from '../../shared/types'
import {
  deleteOption,
  findOption,
  insertOption,
  listOptions,
  nextPosition,
  reorderOptions,
  toOptionDTO,
  updateOption,
} from '../db/options'
import {
  deletePoll,
  findPollById,
  insertPoll,
  listPolls,
  slugExists,
  toPollDTO,
  updatePoll,
  type PollRow,
} from '../db/polls'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/errors'
import { nowIso } from '../lib/http'
import { uniqueSlug } from '../lib/slug'
import { parseJsonBody, parseQuery } from '../lib/validate'
import { requireAdmin, requireFreshPassword } from '../middleware/auth'
import { recordAudit } from '../services/audit'
import { applyTransition, duplicatePoll, loadPoll } from '../services/polls'

/**
 * Administracion de votaciones y de su cartelera.
 *
 * `requireAdmin` se aplica ruta por ruta, no con `use('*')`: bajo el mismo
 * prefijo `/api/polls` conviven los endpoints de votacion accesibles a los
 * trabajadores (ver routes/voting.ts), y un middleware global tambien se
 * ejecutaria sobre ellos.
 */
export const pollAdminRoutes = new Hono<AppEnv>()

// Nadie opera sobre votaciones con un cambio de contrasena pendiente.
pollAdminRoutes.use('*', requireFreshPassword)

async function detailPayload(db: D1Database, poll: PollRow): Promise<PollDetailDTO> {
  const options = await listOptions(db, poll.id)
  return { ...toPollDTO(poll), options: options.map(toOptionDTO) }
}

function assertEditable(poll: PollRow): void {
  if (!isPollEditable(poll.status)) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'Una votacion cerrada o archivada no se puede modificar',
    )
  }
}

function assertOptionsEditable(poll: PollRow): void {
  if (!areOptionsEditable(poll.status)) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'No se puede cambiar la cartelera de una votacion que ya esta abierta o cerrada',
    )
  }
}

// ---------------------------------------------------------------------------
// Votaciones
// ---------------------------------------------------------------------------

/** GET /api/polls */
pollAdminRoutes.get('/', requireAdmin, async (c) => {
  const query = parseQuery(c, listPollsQuerySchema)
  const { items, total } = await listPolls(c.env.DB, query)

  const payload: PaginatedDTO<PollDTO> = {
    items: items.map(toPollDTO),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return c.json(payload)
})

/** POST /api/polls — siempre nace como DRAFT. */
pollAdminRoutes.post('/', requireAdmin, async (c) => {
  const input = await parseJsonBody(c, createPollSchema)
  const id = newId()
  const now = nowIso()
  const slug = await uniqueSlug(input.title, (candidate) => slugExists(c.env.DB, candidate))

  await insertPoll(c.env.DB, {
    id,
    slug,
    title: input.title,
    description: input.description ?? null,
    kind: input.kind,
    allowVoteChange: input.allowVoteChange,
    showLiveResults: input.showLiveResults,
    showResultsAfterClose: input.showResultsAfterClose,
    allowNotAttending: input.allowNotAttending,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdBy: c.get('user')?.id ?? '',
    now,
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.POLL_CREATED,
    entity: 'poll',
    entityId: id,
    metadata: { title: input.title, slug },
  })

  const created = await findPollById(c.env.DB, id)
  if (!created) throw notFound('No se pudo crear la votacion')
  return c.json(await detailPayload(c.env.DB, created), 201)
})

/** GET /api/polls/:id */
pollAdminRoutes.get('/:id', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  return c.json(await detailPayload(c.env.DB, poll))
})

/** PATCH /api/polls/:id */
pollAdminRoutes.patch('/:id', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  assertEditable(poll)

  const input = await parseJsonBody(c, updatePollSchema)

  // Coherencia de la programacion cuando solo se envia uno de los dos extremos.
  const startsAt = input.startsAt === undefined ? poll.starts_at : input.startsAt
  const endsAt = input.endsAt === undefined ? poll.ends_at : input.endsAt
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, 'La finalizacion debe ser posterior al inicio', {
      details: { endsAt: ['La finalizacion debe ser posterior al inicio'] },
    })
  }

  await updatePoll(c.env.DB, poll.id, input, nowIso())

  const touchesSettings =
    input.allowVoteChange !== undefined ||
    input.showLiveResults !== undefined ||
    input.showResultsAfterClose !== undefined ||
    input.allowNotAttending !== undefined

  await recordAudit(c, {
    action: touchesSettings ? AUDIT_ACTIONS.POLL_SETTINGS_UPDATED : AUDIT_ACTIONS.POLL_UPDATED,
    entity: 'poll',
    entityId: poll.id,
    metadata: { changes: input },
  })

  const updated = await findPollById(c.env.DB, poll.id)
  if (!updated) throw notFound('La votacion no existe')
  return c.json(await detailPayload(c.env.DB, updated))
})

/** DELETE /api/polls/:id */
pollAdminRoutes.delete('/:id', requireAdmin, async (c) => {
  const poll = await findPollById(c.env.DB, c.req.param('id'))
  if (!poll) throw notFound('La votacion no existe')

  // Las opciones y los votos caen por ON DELETE CASCADE.
  await deletePoll(c.env.DB, poll.id)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.POLL_DELETED,
    entity: 'poll',
    entityId: poll.id,
    metadata: { title: poll.title, totalVotes: poll.total_votes },
  })

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Ciclo de vida: guardar -> publicar -> abrir -> cerrar -> archivar
// ---------------------------------------------------------------------------

/** Cada accion del administrador es un endpoint propio y explicito. */
const transitionHandler =
  (transition: PollTransition): Handler<AppEnv, '/:id'> =>
  async (c) => {
    const poll = await loadPoll(c.env.DB, c.req.param('id'))
    const updated = await applyTransition(c, poll, transition)
    return c.json(await detailPayload(c.env.DB, updated))
  }

pollAdminRoutes.post('/:id/publish', requireAdmin, transitionHandler('publish'))
pollAdminRoutes.post('/:id/open', requireAdmin, transitionHandler('open'))
pollAdminRoutes.post('/:id/close', requireAdmin, transitionHandler('close'))
pollAdminRoutes.post('/:id/archive', requireAdmin, transitionHandler('archive'))
pollAdminRoutes.post('/:id/reopen', requireAdmin, transitionHandler('reopen'))
pollAdminRoutes.post('/:id/back-to-draft', requireAdmin, transitionHandler('back-to-draft'))

/** POST /api/polls/:id/duplicate */
pollAdminRoutes.post('/:id/duplicate', requireAdmin, async (c) => {
  const source = await findPollById(c.env.DB, c.req.param('id'))
  if (!source) throw notFound('La votacion no existe')

  const input = await parseJsonBody(c, duplicatePollSchema).catch(() => ({ title: undefined }))
  const created = await duplicatePoll(c, source, input.title)
  return c.json(await detailPayload(c.env.DB, created), 201)
})

// ---------------------------------------------------------------------------
// Peliculas (opciones)
// ---------------------------------------------------------------------------

/** POST /api/polls/:id/options */
pollAdminRoutes.post('/:id/options', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  assertOptionsEditable(poll)

  const input = await parseJsonBody(c, createOptionSchema)
  const id = newId()
  const now = nowIso()

  await insertOption(c.env.DB, {
    id,
    pollId: poll.id,
    title: input.title,
    description: input.description ?? null,
    genre: input.genre ?? null,
    year: input.year ?? null,
    durationMinutes: input.durationMinutes ?? null,
    showtime: input.showtime ?? null,
    posterKey: input.posterKey ?? null,
    position: await nextPosition(c.env.DB, poll.id),
    now,
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.OPTION_CREATED,
    entity: 'option',
    entityId: id,
    metadata: { pollId: poll.id, title: input.title },
  })

  const option = await findOption(c.env.DB, poll.id, id)
  if (!option) throw notFound('No se pudo crear la pelicula')
  return c.json({ option: toOptionDTO(option) }, 201)
})

/**
 * PATCH /api/polls/:id/options/reorder
 *
 * Declarada antes que `/:id/options/:optionId` para que "reorder" no se
 * interprete como un identificador.
 */
pollAdminRoutes.patch('/:id/options/reorder', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  assertOptionsEditable(poll)

  const input = await parseJsonBody(c, reorderOptionsSchema)
  const existing = await listOptions(c.env.DB, poll.id)
  const existingIds = new Set(existing.map((option) => option.id))

  // El orden enviado debe contener exactamente las opciones de esta votacion.
  const unknown = input.optionIds.filter((id) => !existingIds.has(id))
  if (unknown.length > 0 || input.optionIds.length !== existing.length) {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, 'El orden enviado no coincide con la cartelera')
  }

  await reorderOptions(c.env.DB, poll.id, input.optionIds, nowIso())
  await recordAudit(c, {
    action: AUDIT_ACTIONS.OPTIONS_REORDERED,
    entity: 'poll',
    entityId: poll.id,
    metadata: { order: input.optionIds },
  })

  const options = await listOptions(c.env.DB, poll.id)
  return c.json({ options: options.map(toOptionDTO) })
})

/** PATCH /api/polls/:id/options/:optionId */
pollAdminRoutes.patch('/:id/options/:optionId', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  assertOptionsEditable(poll)

  const optionId = c.req.param('optionId')
  const option = await findOption(c.env.DB, poll.id, optionId)
  if (!option) throw notFound('La pelicula no existe en esta votacion')

  const input = await parseJsonBody(c, updateOptionSchema)
  await updateOption(c.env.DB, optionId, input, nowIso())

  await recordAudit(c, {
    action: AUDIT_ACTIONS.OPTION_UPDATED,
    entity: 'option',
    entityId: optionId,
    metadata: { pollId: poll.id, changes: input },
  })

  const updated = await findOption(c.env.DB, poll.id, optionId)
  if (!updated) throw notFound('La pelicula no existe en esta votacion')
  return c.json({ option: toOptionDTO(updated) })
})

/** DELETE /api/polls/:id/options/:optionId */
pollAdminRoutes.delete('/:id/options/:optionId', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  assertOptionsEditable(poll)

  const optionId = c.req.param('optionId')
  const option = await findOption(c.env.DB, poll.id, optionId)
  if (!option) throw notFound('La pelicula no existe en esta votacion')

  await deleteOption(c.env.DB, optionId)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.OPTION_DELETED,
    entity: 'option',
    entityId: optionId,
    metadata: { pollId: poll.id, title: option.title },
  })

  return c.json({ ok: true })
})
