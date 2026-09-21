import { Hono } from 'hono'
import {
  canViewAttendanceDetail,
  canViewResults,
  evaluateVoting,
  isVisibleToVoters,
  resolveEffectiveStatus,
} from '../../shared/policy'
import type {
  ActivePollsDTO,
  MyVoteDTO,
  PollDTO,
  VoterPollSummaryDTO,
  VoterPollViewDTO,
} from '../../shared/types'
import { all } from '../db/client'
import { listOptions, toOptionDTO } from '../db/options'
import {
  findPollBySlug,
  listActiveCandidates,
  listVisiblePolls,
  toPollDTO,
  toRuleState,
  type PollRow,
} from '../db/polls'
import { findVote } from '../db/votes'
import type { AppEnv } from '../env'
import { forbidden, notFound } from '../lib/errors'
import { requireAuth, requireFreshPassword } from '../middleware/auth'
import { syncPollStatus } from '../services/polls'
import { buildResults } from '../services/results'

/**
 * Vista del trabajador.
 *
 * Todas las decisiones (si puede votar, si puede cambiar el voto, si puede
 * ver resultados) se calculan aqui y viajan ya resueltas. El cliente no
 * recibe datos que no tenga derecho a ver.
 */
export const voterRoutes = new Hono<AppEnv>()

voterRoutes.use('*', requireAuth, requireFreshPassword)

/**
 * Oculta el recuento global a quien no debe verlo.
 *
 * Solo va para el administrador. A un trabajador no se le envia ni aunque
 * tenga permiso para ver resultados: el total incluye a quienes han dicho
 * que no van, asi que restandole los votos por pelicula saldria cuanta
 * gente ha dicho que no. Se guarda igual que el resto del bloque.
 */
function sanitizePoll(poll: PollRow, allowOverview: boolean): PollDTO {
  const dto = toPollDTO(poll)
  return allowOverview ? dto : { ...dto, totalVotes: null }
}

/**
 * GET /api/me/active-poll
 *
 * Soporte del enlace fijo que el administrador comparte una sola vez
 * (`/votar`). Devuelve las votaciones abiertas en este instante, sincronizando
 * antes las programadas cuya hora ya llego, para que el enlace funcione en el
 * minuto exacto sin esperar al cron.
 */
voterRoutes.get('/active-poll', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const now = new Date()
  const candidates = await listActiveCandidates(c.env.DB, now.toISOString())

  const votedRows = await all<{ poll_id: string }>(
    c.env.DB.prepare('SELECT poll_id FROM votes WHERE user_id = ?').bind(user.id),
  )
  const votedPollIds = new Set(votedRows.map((row) => row.poll_id))

  const polls: ActivePollsDTO['polls'] = []

  for (const candidate of candidates) {
    const poll = await syncPollStatus(c.env.DB, candidate, now)
    if (resolveEffectiveStatus(toRuleState(poll), now) !== 'ACTIVE') continue

    polls.push({
      id: poll.id,
      slug: poll.slug,
      title: poll.title,
      endsAt: poll.ends_at,
      hasVoted: votedPollIds.has(poll.id),
    })
  }

  const payload: ActivePollsDTO = { polls, serverTime: now.toISOString() }
  return c.json(payload)
})

/** GET /api/me/polls */
voterRoutes.get('/polls', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const polls = await listVisiblePolls(c.env.DB)
  const now = new Date()

  // Un unico viaje a la base para saber en cuales ya ha votado.
  const votedRows = await all<{ poll_id: string }>(
    c.env.DB.prepare('SELECT poll_id FROM votes WHERE user_id = ?').bind(user.id),
  )
  const votedPollIds = new Set(votedRows.map((row) => row.poll_id))

  const items: VoterPollSummaryDTO[] = []

  for (const row of polls) {
    const poll = await syncPollStatus(c.env.DB, row, now)
    const rules = toRuleState(poll)
    if (!isVisibleToVoters(rules, now)) continue

    const hasVoted = votedPollIds.has(poll.id)
    const evaluation = evaluateVoting(
      rules,
      { role: user.role, userStatus: user.status, hasVoted },
      now,
    )
    const allowResults = canViewResults(rules, user.role, now)

    items.push({
      poll: sanitizePoll(poll, canViewAttendanceDetail(user.role)),
      hasVoted,
      canVote: evaluation.canVote,
      canChangeVote: evaluation.canChangeVote,
      canViewResults: allowResults,
      blockReason: evaluation.blockReason,
    })
  }

  return c.json({ items })
})

/**
 * GET /api/me/polls/:slug
 *
 * Es la URL privada que comparte el administrador. El slug no es un secreto:
 * sin sesion valida esta ruta responde 401 igualmente.
 */
voterRoutes.get('/polls/:slug', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const found = await findPollBySlug(c.env.DB, c.req.param('slug'))
  if (!found) throw notFound('La votacion no existe')

  const now = new Date()
  const poll = await syncPollStatus(c.env.DB, found, now)
  const rules = toRuleState(poll)

  // Un borrador no existe para los trabajadores.
  if (!isVisibleToVoters(rules, now) && user.role !== 'ADMIN') {
    throw notFound('La votacion no existe')
  }

  const [options, vote] = await Promise.all([
    listOptions(c.env.DB, poll.id),
    findVote(c.env.DB, poll.id, user.id),
  ])

  const hasVoted = vote !== null
  const evaluation = evaluateVoting(
    rules,
    { role: user.role, userStatus: user.status, hasVoted },
    now,
  )
  const allowResults = canViewResults(rules, user.role, now)
  const allowOverview = canViewAttendanceDetail(user.role)

  let myVote: MyVoteDTO | null = null
  if (vote) {
    const option = options.find((item) => item.id === vote.option_id)
    myVote = {
      attending: vote.attending === 1,
      optionId: vote.option_id,
      optionTitle: option?.title ?? null,
      createdAt: vote.created_at,
      updatedAt: vote.updated_at,
      changeCount: vote.change_count,
    }
  }

  const payload: VoterPollViewDTO = {
    poll: sanitizePoll(poll, allowOverview),
    options: options.map(toOptionDTO),
    myVote,
    permissions: {
      canVote: evaluation.canVote,
      canChangeVote: evaluation.canChangeVote,
      canViewResults: allowResults,
      blockReason: evaluation.blockReason,
    },
    results: allowResults ? await buildResults(c.env.DB, poll, allowOverview) : null,
    serverTime: now.toISOString(),
  }

  return c.json(payload)
})
