import type { PollStatus, Role, UserStatus, VoteBlockReason } from './types'

/**
 * Reglas de negocio puras: sin base de datos, sin HTTP, sin React.
 *
 * El backend es el unico que las APLICA (ver src/server/services), pero el
 * frontend las importa para pintar la UI de forma coherente. Que el cliente
 * conozca la regla no significa que pueda saltarsela: cada endpoint la vuelve
 * a evaluar contra el estado real de la base de datos.
 */

export interface PollRuleState {
  status: PollStatus
  allowVoteChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
  startsAt: string | null
  endsAt: string | null
}

export interface VoterContext {
  role: Role
  userStatus: UserStatus
  hasVoted: boolean
}

const time = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

// ---------------------------------------------------------------------------
// Ventana de votacion
// ---------------------------------------------------------------------------

export type ScheduleState = 'OPEN' | 'NOT_STARTED' | 'ENDED'

/** Evalua solo la programacion horaria, ignorando el estado de la votacion. */
export function getScheduleState(poll: PollRuleState, now: Date = new Date()): ScheduleState {
  const nowMs = now.getTime()
  const starts = time(poll.startsAt)
  const ends = time(poll.endsAt)

  if (starts !== null && nowMs < starts) return 'NOT_STARTED'
  if (ends !== null && nowMs >= ends) return 'ENDED'
  return 'OPEN'
}

/**
 * Estado "real" de una votacion en un instante dado.
 *
 * Permite que una votacion programada se comporte como abierta/cerrada aunque
 * el cron todavia no haya pasado, y que el cron solo tenga que persistir lo
 * que esta funcion ya calcula. Nunca abre un borrador.
 */
export function resolveEffectiveStatus(poll: PollRuleState, now: Date = new Date()): PollStatus {
  const schedule = getScheduleState(poll, now)

  if (poll.status === 'SCHEDULED' && schedule === 'OPEN' && poll.startsAt) {
    return 'ACTIVE'
  }
  if ((poll.status === 'SCHEDULED' || poll.status === 'PUBLISHED') && schedule === 'ENDED' && poll.endsAt) {
    return 'CLOSED'
  }
  if (poll.status === 'ACTIVE' && schedule === 'ENDED') {
    return 'CLOSED'
  }
  return poll.status
}

// ---------------------------------------------------------------------------
// Votar
// ---------------------------------------------------------------------------

export interface VoteEvaluation {
  canVote: boolean
  canChangeVote: boolean
  blockReason: VoteBlockReason | null
}

/**
 * Decide si un usuario puede emitir o cambiar su voto.
 *
 * Orden de comprobaciones pensado para que el motivo mostrado sea el mas util:
 * primero el usuario, luego el estado de la votacion, luego el horario y por
 * ultimo la regla de cambio de voto.
 */
export function evaluateVoting(
  poll: PollRuleState,
  voter: VoterContext,
  now: Date = new Date(),
): VoteEvaluation {
  const blocked = (blockReason: VoteBlockReason): VoteEvaluation => ({
    canVote: false,
    canChangeVote: false,
    blockReason,
  })

  if (voter.userStatus !== 'ACTIVE') return blocked('USER_INACTIVE')

  const effective = resolveEffectiveStatus(poll, now)

  if (effective === 'ARCHIVED') return blocked('ARCHIVED')
  if (effective === 'CLOSED') return blocked('CLOSED')
  if (effective !== 'ACTIVE') {
    return blocked(getScheduleState(poll, now) === 'NOT_STARTED' ? 'NOT_STARTED' : 'NOT_OPEN')
  }

  const schedule = getScheduleState(poll, now)
  if (schedule === 'NOT_STARTED') return blocked('NOT_STARTED')
  if (schedule === 'ENDED') return blocked('ENDED')

  if (voter.hasVoted && !poll.allowVoteChange) return blocked('ALREADY_VOTED')

  return {
    canVote: !voter.hasVoted,
    canChangeVote: voter.hasVoted && poll.allowVoteChange,
    blockReason: null,
  }
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/**
 * Quien puede ver los resultados.
 *
 * El administrador siempre. El trabajador solo si la configuracion de la
 * votacion lo permite para el estado actual:
 *   ACTIVE            -> showLiveResults
 *   CLOSED / ARCHIVED -> showResultsAfterClose
 *   resto             -> nunca (no hay nada que ensenar todavia)
 */
export function canViewResults(poll: PollRuleState, role: Role, now: Date = new Date()): boolean {
  if (role === 'ADMIN') return true

  const effective = resolveEffectiveStatus(poll, now)
  if (effective === 'ACTIVE') return poll.showLiveResults
  if (effective === 'CLOSED' || effective === 'ARCHIVED') return poll.showResultsAfterClose
  return false
}

/**
 * Quien puede ver el detalle de organizacion (censo, asistencia, quien falta).
 *
 * Solo el administrador, y da igual como este configurada la votacion. Ver
 * el recuento por pelicula y saber cuanta gente no va son dos permisos
 * distintos: lo primero es el resultado de la votacion, lo segundo es
 * informacion de plantilla que no le corresponde a un trabajador.
 */
export function canViewAttendanceDetail(role: Role): boolean {
  return role === 'ADMIN'
}

/** Una votacion es visible para un trabajador a partir de que se publica. */
export function isVisibleToVoters(poll: PollRuleState, now: Date = new Date()): boolean {
  const effective = resolveEffectiveStatus(poll, now)
  return effective !== 'DRAFT'
}

// ---------------------------------------------------------------------------
// Maquina de estados
// ---------------------------------------------------------------------------

export type PollTransition = 'publish' | 'open' | 'close' | 'archive' | 'reopen' | 'back-to-draft'

const TRANSITIONS: Record<PollTransition, { from: PollStatus[]; to: PollStatus }> = {
  publish: { from: ['DRAFT'], to: 'PUBLISHED' },
  open: { from: ['PUBLISHED', 'SCHEDULED', 'CLOSED'], to: 'ACTIVE' },
  close: { from: ['ACTIVE', 'PUBLISHED', 'SCHEDULED'], to: 'CLOSED' },
  archive: { from: ['CLOSED', 'DRAFT', 'PUBLISHED', 'SCHEDULED'], to: 'ARCHIVED' },
  reopen: { from: ['ARCHIVED'], to: 'CLOSED' },
  'back-to-draft': { from: ['PUBLISHED', 'SCHEDULED'], to: 'DRAFT' },
}

export function canTransition(from: PollStatus, transition: PollTransition): boolean {
  return TRANSITIONS[transition].from.includes(from)
}

export function targetStatus(transition: PollTransition): PollStatus {
  return TRANSITIONS[transition].to
}

export function availableTransitions(from: PollStatus): PollTransition[] {
  return (Object.keys(TRANSITIONS) as PollTransition[]).filter((transition) =>
    canTransition(from, transition),
  )
}

/** Solo se puede editar el contenido mientras la votacion no este cerrada. */
export function isPollEditable(status: PollStatus): boolean {
  return status !== 'CLOSED' && status !== 'ARCHIVED'
}

/**
 * Las opciones se bloquean en cuanto la votacion esta abierta: cambiar la
 * cartelera con votos ya emitidos invalidaria los resultados.
 */
export function areOptionsEditable(status: PollStatus): boolean {
  return status === 'DRAFT' || status === 'PUBLISHED' || status === 'SCHEDULED'
}

// ---------------------------------------------------------------------------
// Calculos
// ---------------------------------------------------------------------------

/** Porcentaje 0-100 con un decimal, seguro ante division por cero. */
export function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}
