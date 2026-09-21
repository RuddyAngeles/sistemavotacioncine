import { percentage } from '../../shared/policy'
import type {
  AttendanceDTO,
  ParticipationDTO,
  ResultsDTO,
  ResultsOverviewDTO,
} from '../../shared/types'
import { listOptions, posterUrl } from '../db/options'
import type { PollRow } from '../db/polls'
import { countEligibleVoters } from '../db/users'
import { attendanceOf, countAttendance, participationRows, tallyVotes } from '../db/votes'

/**
 * Construye el recuento de una votacion.
 *
 * Hay dos permisos distintos y los decide la capa de rutas:
 *   - `canViewResults`          -> si se puede llamar a esto siquiera
 *   - `canViewAttendanceDetail` -> si ademas viaja el bloque `overview`
 *
 * Cuando no hay permiso, el backend ni siquiera ejecuta las consultas: los
 * datos no viajan al cliente para luego ocultarse con CSS.
 */
export async function buildResults(
  db: D1Database,
  poll: PollRow,
  includeOverview: boolean,
): Promise<ResultsDTO> {
  const [options, tally] = await Promise.all([listOptions(db, poll.id), tallyVotes(db, poll.id)])

  const votesByOption = new Map(tally.map((row) => [row.option_id, row.votes]))

  /*
   * Los votos de "no asistire" cuentan como participacion pero NO compiten
   * con las peliculas: el porcentaje de cada una se reparte solo entre
   * quienes si van. Si no, una pelicula podria "ganar" con el 30% mientras
   * la mitad de la plantilla ha dicho que no va.
   *
   * El denominador sale del propio recuento por pelicula, no de una consulta
   * aparte: por la restriccion de la tabla, todo voto con pelicula es de
   * alguien que asiste y todo voto sin pelicula es de alguien que no. Asi el
   * porcentaje se calcula igual para todo el mundo sin tocar el censo.
   */
  const asisten = tally.reduce((total, row) => total + row.votes, 0)

  const results = options.map((option) => {
    const votes = votesByOption.get(option.id) ?? 0
    return {
      optionId: option.id,
      title: option.title,
      posterUrl: posterUrl(option.poster_key),
      votes,
      percentage: percentage(votes, asisten),
    }
  })

  // Orden por votos descendente; a igualdad, se respeta el orden de cartelera.
  results.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes
    const positionA = options.findIndex((option) => option.id === a.optionId)
    const positionB = options.findIndex((option) => option.id === b.optionId)
    return positionA - positionB
  })

  return {
    pollId: poll.id,
    status: poll.status,
    options: results,
    overview: includeOverview ? await buildOverview(db, poll.id) : null,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Bloque de organizacion, solo para quien tiene derecho a verlo.
 *
 * Esta en una funcion aparte porque sus consultas (censo y asistencia) no
 * deben lanzarse siquiera cuando quien mira es un trabajador.
 */
async function buildOverview(db: D1Database, pollId: string): Promise<ResultsOverviewDTO> {
  const [eligibleVoters, counts] = await Promise.all([
    countEligibleVoters(db),
    countAttendance(db, pollId),
  ])

  const totalVotes = counts.attending + counts.notAttending

  const attendance: AttendanceDTO = {
    attending: counts.attending,
    notAttending: counts.notAttending,
    pending: Math.max(0, eligibleVoters - totalVotes),
    eligible: eligibleVoters,
  }

  return {
    totalVotes,
    eligibleVoters,
    attendance,
    participationRate: percentage(totalVotes, eligibleVoters),
  }
}

/**
 * Estado de participacion.
 *
 * `includeChoices` separa dos cosas distintas a proposito:
 *   - quien ha participado  -> informacion de gestion
 *   - que ha votado cada uno -> informacion sensible, bajo peticion explicita
 *
 * Quien asiste y quien no SI se incluye siempre: es lo que hace falta para
 * organizar (cuantas entradas comprar) y no revela la preferencia de nadie.
 */
export async function buildParticipation(
  db: D1Database,
  poll: PollRow,
  includeChoices: boolean,
): Promise<ParticipationDTO> {
  const rows = await participationRows(db, poll.id)

  const users = rows.map((row) => {
    const hasVoted = row.voted_at !== null
    const base = {
      userId: row.user_id,
      name: row.name,
      username: row.username,
      role: row.role,
      hasVoted,
      votedAt: row.voted_at,
      lastChangedAt: row.last_changed_at,
      attending: attendanceOf(row),
    }
    if (!includeChoices) return base
    return { ...base, choiceOptionId: row.option_id, choiceTitle: row.option_title }
  })

  const voted = users.filter((user) => user.hasVoted).length
  const eligible = users.length
  const attending = users.filter((user) => user.attending === true).length
  const notAttending = users.filter((user) => user.attending === false).length

  return {
    pollId: poll.id,
    eligible,
    voted,
    notVoted: eligible - voted,
    attendance: {
      attending,
      notAttending,
      pending: eligible - voted,
      eligible,
    },
    participationRate: percentage(voted, eligible),
    includesChoices: includeChoices,
    users,
  }
}
