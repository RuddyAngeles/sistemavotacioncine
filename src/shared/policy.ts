import type { PollStatus, Role, SurveyBlockReason, UserStatus, VoteBlockReason } from './types'

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

// ---------------------------------------------------------------------------
// Encuestas
//
// El calendario, la maquina de estados y la visibilidad de resultados son los
// mismos que en las votaciones, asi que se reutilizan tal cual en lugar de
// duplicar reglas que luego se separarian. Lo que si es propio de una encuesta
// es el permiso para participar y el efecto del anonimato.
// ---------------------------------------------------------------------------

export interface SurveyRuleState {
  status: PollStatus
  anonymous: boolean
  allowResponseChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
  startsAt: string | null
  endsAt: string | null
}

/** La parte de la encuesta que se rige por las mismas reglas que una votacion. */
function comoVotacion(survey: SurveyRuleState): PollRuleState {
  return {
    status: survey.status,
    allowVoteChange: survey.allowResponseChange,
    showLiveResults: survey.showLiveResults,
    showResultsAfterClose: survey.showResultsAfterClose,
    startsAt: survey.startsAt,
    endsAt: survey.endsAt,
  }
}

export interface SurveyActorState {
  role: Role
  userStatus: UserStatus
  canAnswerSurveys: boolean
  hasAnswered: boolean
}

export interface SurveyEvaluation {
  canAnswer: boolean
  canChangeAnswer: boolean
  blockReason: SurveyBlockReason | null
}

/**
 * Que puede hacer una persona con una encuesta.
 *
 * El permiso se comprueba el primero y vale para todo el mundo, tambien para
 * los administradores: administrar encuestas y participar en ellas son cosas
 * distintas, y mezclarlas haria que un admin apareciese como respondiente sin
 * haberlo decidido nadie.
 *
 * Una encuesta anonima nunca deja cambiar la respuesta. No es una preferencia:
 * sin vinculo entre la persona y su envio, no hay respuesta que localizar.
 */
export function evaluateSurvey(
  survey: SurveyRuleState,
  actor: SurveyActorState,
  now: Date = new Date(),
): SurveyEvaluation {
  const bloqueado = (blockReason: SurveyBlockReason): SurveyEvaluation => ({
    canAnswer: false,
    canChangeAnswer: false,
    blockReason,
  })

  if (actor.userStatus !== 'ACTIVE') return bloqueado('USER_INACTIVE')
  if (!actor.canAnswerSurveys) return bloqueado('NO_PERMISSION')

  const efectivo = resolveEffectiveStatus(comoVotacion(survey), now)

  if (efectivo === 'DRAFT' || efectivo === 'PUBLISHED' || efectivo === 'SCHEDULED') {
    const ventana = getScheduleState(comoVotacion(survey), now)
    return bloqueado(ventana === 'NOT_STARTED' ? 'NOT_STARTED' : 'NOT_OPEN')
  }
  if (efectivo === 'CLOSED') {
    return bloqueado(getScheduleState(comoVotacion(survey), now) === 'ENDED' ? 'ENDED' : 'CLOSED')
  }
  if (efectivo === 'ARCHIVED') return bloqueado('ARCHIVED')

  if (actor.hasAnswered) {
    // En una anonima esto nunca es `true`, porque `allowResponseChange` no
    // puede estarlo: lo impide tambien un CHECK en la base.
    if (survey.allowResponseChange && !survey.anonymous) {
      return { canAnswer: false, canChangeAnswer: true, blockReason: null }
    }
    return bloqueado('ALREADY_ANSWERED')
  }

  return { canAnswer: true, canChangeAnswer: false, blockReason: null }
}

/** Misma regla que en las votaciones: la configuracion manda, el admin siempre. */
export function canViewSurveyResults(
  survey: SurveyRuleState,
  role: Role,
  now: Date = new Date(),
): boolean {
  return canViewResults(comoVotacion(survey), role, now)
}

/** Una encuesta es visible para quien participa a partir de que se publica. */
export function isSurveyVisible(survey: SurveyRuleState, now: Date = new Date()): boolean {
  return isVisibleToVoters(comoVotacion(survey), now)
}

export function resolveSurveyStatus(survey: SurveyRuleState, now: Date = new Date()): PollStatus {
  return resolveEffectiveStatus(comoVotacion(survey), now)
}

/**
 * Cuando se pueden tocar las preguntas de una encuesta.
 *
 * Lo que decide NO es el estado, sino si ya hay respuestas. Antes se
 * bloqueaban al abrir la encuesta, copiando la regla de la cartelera de una
 * votacion, y era una regla mal trasladada: una encuesta recien abierta a la
 * que todavia no ha contestado nadie se puede corregir sin que eso invalide
 * nada. Bloquearla solo obligaba a rehacerla entera por una errata.
 *
 * Lo que si queda cerrado es una encuesta cerrada o archivada: sus resultados
 * ya se han dado por buenos y puede que se hayan compartido.
 */
export function areQuestionsEditable(status: PollStatus): boolean {
  return status !== 'CLOSED' && status !== 'ARCHIVED'
}

/**
 * Si un cambio concreto puede destruir respuestas ya recibidas.
 *
 * Corregir el enunciado de una pregunta, o el texto de una opcion, no toca
 * las respuestas: apuntan al identificador de la opcion, no a su texto. Lo
 * que si las destruye es ELIMINAR una opcion o una pregunta que alguien ya
 * ha contestado. Por eso esos dos casos piden confirmacion explicita y el
 * resto no.
 */
export function editDestruyeRespuestas(respuestasAfectadas: number): boolean {
  return respuestasAfectadas > 0
}

/**
 * El anonimato solo se puede cambiar mientras la encuesta sea un borrador.
 *
 * Pasarla a anonima con respuestas ya identificadas no las anonimizaria (los
 * `user_id` ya estan escritos), y al reves seria peor: prometeria una
 * identificacion que no existe.
 */
export function isAnonymityEditable(status: PollStatus): boolean {
  return status === 'DRAFT'
}

/**
 * Con muy pocos envios, ver los resultados de una encuesta anonima puede
 * bastar para deducir quien contesto que. El sistema no lo impide (seria
 * arbitrario), pero si lo avisa.
 */
export const ANONYMITY_SAFE_MINIMUM = 5

export function isAnonymityAtRisk(anonymous: boolean, submissions: number): boolean {
  return anonymous && submissions > 0 && submissions < ANONYMITY_SAFE_MINIMUM
}
