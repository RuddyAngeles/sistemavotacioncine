import { Hono } from 'hono'
import type { Context } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import { canViewAttendanceDetail, canViewResults, evaluateVoting } from '../../shared/policy'
import {
  castVoteSchema,
  isNotAttendingVote,
  participationQuerySchema,
  type CastVoteInput,
} from '../../shared/schemas'
import type { ErrorCode, MyVoteDTO, VoteBlockReason } from '../../shared/types'
import { fromBool, isUniqueViolation } from '../db/client'
import { findOption } from '../db/options'
import { toRuleState, type PollRow } from '../db/polls'
import { findVote, insertVote, updateVoteChoice } from '../db/votes'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, forbidden, notFound } from '../lib/errors'
import { nowIso } from '../lib/http'
import { parseJsonBody, parseQuery } from '../lib/validate'
import { requireAdmin, requireAuth, requireFreshPassword } from '../middleware/auth'
import { recordAudit } from '../services/audit'
import { loadPoll } from '../services/polls'
import { buildParticipation, buildResults } from '../services/results'

/**
 * Emision de votos y consulta de resultados.
 *
 * Comparte el prefijo `/api/polls` con las rutas de administracion, pero
 * estas son accesibles a cualquier usuario autenticado; cada una declara su
 * propio nivel de acceso.
 */
export const votingRoutes = new Hono<AppEnv>()



/** Mensajes por motivo de bloqueo, para que el error sea accionable. */
const BLOCK_MESSAGES: Record<VoteBlockReason, { status: number; code: ErrorCode; message: string }> = {
  NOT_OPEN: {
    status: 409,
    code: ERROR_CODES.POLL_NOT_OPEN,
    message: 'La votacion todavia no esta abierta',
  },
  NOT_STARTED: {
    status: 409,
    code: ERROR_CODES.POLL_NOT_STARTED,
    message: 'La votacion aun no ha comenzado',
  },
  ENDED: { status: 409, code: ERROR_CODES.POLL_ENDED, message: 'El plazo de votacion ha terminado' },
  CLOSED: { status: 409, code: ERROR_CODES.POLL_ENDED, message: 'La votacion esta cerrada' },
  ARCHIVED: {
    status: 409,
    code: ERROR_CODES.POLL_ENDED,
    message: 'La votacion esta archivada y no admite votos',
  },
  ALREADY_VOTED: {
    status: 409,
    code: ERROR_CODES.VOTE_CHANGE_NOT_ALLOWED,
    message: 'Ya has votado y esta votacion no permite cambiar el voto',
  },
  USER_INACTIVE: {
    status: 403,
    code: ERROR_CODES.FORBIDDEN,
    message: 'Tu cuenta no esta activa',
  },
}

function blockError(reason: VoteBlockReason): AppError {
  const mapped = BLOCK_MESSAGES[reason] ?? {
    status: 409,
    code: ERROR_CODES.POLL_NOT_OPEN,
    message: 'No puedes votar en este momento',
  }
  return new AppError(mapped.status, mapped.code, mapped.message)
}

/**
 * Traduce lo que envia el cliente a lo que se guarda.
 *
 * `optionId = null` representa "no asistire". Aqui se comprueba tanto que la
 * votacion admita esa respuesta como que la pelicula elegida pertenezca de
 * verdad a esta votacion: sin esto, se podria votar una opcion de otra.
 */
async function resolveChoice(
  c: Context<AppEnv>,
  poll: PollRow,
  input: CastVoteInput,
): Promise<{ optionId: string | null; optionTitle: string | null }> {
  if (isNotAttendingVote(input)) {
    if (!fromBool(poll.allow_not_attending)) {
      throw new AppError(
        409,
        ERROR_CODES.NOT_ATTENDING_DISABLED,
        'Esta votacion no admite la respuesta "no asistire"',
      )
    }
    return { optionId: null, optionTitle: null }
  }

  const option = await findOption(c.env.DB, poll.id, input.optionId)
  if (!option) throw notFound('La pelicula seleccionada no pertenece a esta votacion')
  return { optionId: option.id, optionTitle: option.title }
}

/** GET /api/polls/:id/my-vote */
votingRoutes.get('/:id/my-vote', requireAuth, requireFreshPassword, async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  const vote = await findVote(c.env.DB, poll.id, user.id)

  if (!vote) return c.json({ vote: null })

  const option = vote.option_id ? await findOption(c.env.DB, poll.id, vote.option_id) : null
  const payload: MyVoteDTO = {
    attending: fromBool(vote.attending),
    optionId: vote.option_id,
    optionTitle: option?.title ?? null,
    createdAt: vote.created_at,
    updatedAt: vote.updated_at,
    changeCount: vote.change_count,
  }
  return c.json({ vote: payload })
})

/** POST /api/polls/:id/vote — primer voto del usuario. */
votingRoutes.post('/:id/vote', requireAuth, requireFreshPassword, async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  const input = await parseJsonBody(c, castVoteSchema)

  const existing = await findVote(c.env.DB, poll.id, user.id)
  const evaluation = evaluateVoting(toRuleState(poll), {
    role: user.role,
    userStatus: user.status,
    hasVoted: existing !== null,
  })

  if (evaluation.blockReason) throw blockError(evaluation.blockReason)
  if (existing) {
    throw new AppError(
      409,
      ERROR_CODES.VOTE_ALREADY_CAST,
      'Ya has votado. Usa la opcion de cambiar el voto.',
    )
  }

  const choice = await resolveChoice(c, poll, input)
  const now = nowIso()

  try {
    await insertVote(c.env.DB, {
      id: newId(),
      pollId: poll.id,
      userId: user.id,
      optionId: choice.optionId,
      now,
    })
  } catch (error) {
    // Dos peticiones simultaneas del mismo usuario: la base de datos gana.
    if (isUniqueViolation(error)) {
      throw new AppError(409, ERROR_CODES.VOTE_ALREADY_CAST, 'Ya has votado en esta votacion')
    }
    throw error
  }

  return c.json({
    vote: {
      attending: choice.optionId !== null,
      optionId: choice.optionId,
      optionTitle: choice.optionTitle,
      createdAt: now,
      updatedAt: now,
      changeCount: 0,
    } satisfies MyVoteDTO,
  })
})

/** PATCH /api/polls/:id/vote — cambia el voto existente, no crea otro. */
votingRoutes.patch('/:id/vote', requireAuth, requireFreshPassword, async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  const input = await parseJsonBody(c, castVoteSchema)

  const existing = await findVote(c.env.DB, poll.id, user.id)
  if (!existing) {
    throw new AppError(404, ERROR_CODES.VOTE_NOT_FOUND, 'Todavia no has votado en esta votacion')
  }

  const evaluation = evaluateVoting(toRuleState(poll), {
    role: user.role,
    userStatus: user.status,
    hasVoted: true,
  })

  if (evaluation.blockReason) throw blockError(evaluation.blockReason)
  if (!evaluation.canChangeVote) {
    throw new AppError(
      409,
      ERROR_CODES.VOTE_CHANGE_NOT_ALLOWED,
      'Esta votacion no permite cambiar el voto',
    )
  }

  const choice = await resolveChoice(c, poll, input)
  const now = nowIso()
  const cambia = choice.optionId !== existing.option_id

  if (cambia) {
    await updateVoteChoice(c.env.DB, existing.id, choice.optionId, now)
  }

  return c.json({
    vote: {
      attending: choice.optionId !== null,
      optionId: choice.optionId,
      optionTitle: choice.optionTitle,
      createdAt: existing.created_at,
      updatedAt: cambia ? now : existing.updated_at,
      changeCount: existing.change_count + (cambia ? 1 : 0),
    } satisfies MyVoteDTO,
  })
})

/**
 * GET /api/polls/:id/results
 *
 * El backend decide si hay derecho a ver los resultados. Cuando no lo hay,
 * responde 403 y NO calcula ni envia ningun recuento: no se trata de
 * ocultarlos en el cliente.
 */
votingRoutes.get('/:id/results', requireAuth, requireFreshPassword, async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const poll = await loadPoll(c.env.DB, c.req.param('id'))

  if (!canViewResults(toRuleState(poll), user.role)) {
    throw new AppError(
      403,
      ERROR_CODES.RESULTS_HIDDEN,
      'El administrador ha decidido ocultar los resultados de esta votacion',
    )
  }

  const results = await buildResults(c.env.DB, poll, canViewAttendanceDetail(user.role))
  return c.json({ results })
})

/**
 * GET /api/polls/:id/participation — solo ADMIN.
 *
 * Con `includeChoices=true` se revela que ha votado cada persona. Esa
 * consulta queda registrada en la auditoria.
 */
votingRoutes.get('/:id/participation', requireAdmin, async (c) => {
  const poll = await loadPoll(c.env.DB, c.req.param('id'))
  const query = parseQuery(c, participationQuerySchema)

  const participation = await buildParticipation(c.env.DB, poll, query.includeChoices)

  if (query.includeChoices) {
    await recordAudit(c, {
      action: AUDIT_ACTIONS.PARTICIPATION_CHOICES_VIEWED,
      entity: 'participation',
      entityId: poll.id,
      metadata: { pollTitle: poll.title },
    })
  }

  return c.json({ participation })
})


