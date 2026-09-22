import type {
  POLL_KINDS,
  POLL_STATUSES,
  ROLES,
  USER_STATUSES,
  ERROR_CODES,
} from './constants'

export type Role = (typeof ROLES)[number]
export type UserStatus = (typeof USER_STATUSES)[number]
export type PollKind = (typeof POLL_KINDS)[number]
export type PollStatus = (typeof POLL_STATUSES)[number]
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/** Usuario tal y como lo ve el administrador. Nunca incluye el hash. */
export interface UserDTO {
  id: string
  name: string
  username: string
  role: Role
  status: UserStatus
  mustChangePassword: boolean
  /** Permiso independiente del rol: participar en encuestas. */
  canAnswerSurveys: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

/** Identidad minima del usuario autenticado (`GET /api/auth/me`). */
export interface SessionUserDTO {
  id: string
  name: string
  username: string
  role: Role
  mustChangePassword: boolean
  canAnswerSurveys: boolean
}

// ---------------------------------------------------------------------------
// Votaciones
// ---------------------------------------------------------------------------

export interface PollSettings {
  allowVoteChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
  /** Permite responder "no asistire" en lugar de elegir una pelicula. */
  allowNotAttending: boolean
}

export interface PollDTO extends PollSettings {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PollKind
  status: PollStatus
  startsAt: string | null
  endsAt: string | null
  publishedAt: string | null
  openedAt: string | null
  closedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  optionCount: number
  /**
   * `null` cuando quien consulta no tiene permiso para ver resultados.
   * El backend no envia el recuento en lugar de enviarlo y ocultarlo.
   */
  totalVotes: number | null
}

export interface PollOptionDTO {
  id: string
  pollId: string
  title: string
  description: string | null
  genre: string | null
  year: number | null
  durationMinutes: number | null
  showtime: string | null
  /** URL servida por el Worker (`/api/media/...`), no una URL publica de R2. */
  posterUrl: string | null
  posterKey: string | null
  position: number
}

export interface PollDetailDTO extends PollDTO {
  options: PollOptionDTO[]
}

// ---------------------------------------------------------------------------
// Votos
// ---------------------------------------------------------------------------

/**
 * El voto propio. `attending: false` significa "no ire": en ese caso no hay
 * pelicula elegida y `optionId` es null.
 */
export interface MyVoteDTO {
  attending: boolean
  optionId: string | null
  optionTitle: string | null
  createdAt: string
  updatedAt: string
  changeCount: number
}

export type VoteBlockReason =
  | 'NOT_OPEN'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'ALREADY_VOTED'
  | 'USER_INACTIVE'

export interface VoterPermissions {
  canVote: boolean
  canChangeVote: boolean
  canViewResults: boolean
  /** Motivo por el que no puede votar, o `null` si si puede. */
  blockReason: VoteBlockReason | null
}

/**
 * Respuesta del enlace fijo: que votacion esta abierta ahora mismo.
 *
 * Se devuelve una lista porque nada impide tener dos abiertas a la vez; el
 * caso normal es que haya una sola (o ninguna).
 */
export interface ActivePollsDTO {
  polls: Array<{
    id: string
    slug: string
    title: string
    endsAt: string | null
    hasVoted: boolean
  }>
  serverTime: string
}

/** Resumen de una votacion en la lista del trabajador. */
export interface VoterPollSummaryDTO {
  poll: PollDTO
  hasVoted: boolean
  canVote: boolean
  canChangeVote: boolean
  canViewResults: boolean
  blockReason: VoteBlockReason | null
}

/**
 * Todo lo que la pantalla de votacion necesita, resuelto en el backend.
 * El cliente no decide permisos: solo los representa.
 */
export interface VoterPollViewDTO {
  poll: PollDTO
  options: PollOptionDTO[]
  myVote: MyVoteDTO | null
  permissions: VoterPermissions
  /** `null` cuando el usuario no tiene permiso para ver resultados. */
  results: ResultsDTO | null
  serverTime: string
}

// ---------------------------------------------------------------------------
// Resultados y participacion
// ---------------------------------------------------------------------------

export interface ResultsOptionDTO {
  optionId: string
  title: string
  posterUrl: string | null
  votes: number
  /**
   * Reparto entre quienes SI asisten, 0-100 con un decimal.
   * Los votos de "no asistire" no entran: no compiten con las peliculas.
   */
  percentage: number
}

/** Recuento de asistencia: lo que hace falta para comprar las entradas. */
export interface AttendanceDTO {
  /** Personas que han dicho que si van. Es el numero de entradas. */
  attending: number
  /** Personas que han dicho que no van. */
  notAttending: number
  /** Personas del censo que aun no han respondido. */
  pending: number
  /** Total de cuentas activas con derecho a voto. */
  eligible: number
}

/**
 * Detalle de organizacion: censo, asistencia y participacion.
 *
 * Va agrupado en un objeto aparte, y no suelto dentro de `ResultsDTO`, para
 * que sea imposible enviar por descuido una de estas cifras a quien no debe
 * verlas: o viaja el bloque entero o no viaja nada.
 */
export interface ResultsOverviewDTO {
  /** Respuestas recibidas: asisten + no asisten. */
  totalVotes: number
  eligibleVoters: number
  attendance: AttendanceDTO
  /** 0-100, redondeado a un decimal. */
  participationRate: number
}

export interface ResultsDTO {
  pollId: string
  status: PollStatus
  options: ResultsOptionDTO[]
  /**
   * Solo para ADMIN. Para un trabajador vale `null` y el servidor ni siquiera
   * ejecuta las consultas: el reparto por pelicula si es suyo, saber quien no
   * va o cuanta gente falta por responder no lo es.
   */
  overview: ResultsOverviewDTO | null
  generatedAt: string
}

export interface ParticipationUserDTO {
  userId: string
  name: string
  username: string
  role: Role
  hasVoted: boolean
  votedAt: string | null
  lastChangedAt: string | null
  /** `false` si respondio que no asiste; `null` si aun no ha respondido. */
  attending: boolean | null
  /** Solo presente si el admin pidio explicitamente ver las elecciones. */
  choiceOptionId?: string | null
  choiceTitle?: string | null
}

export interface ParticipationDTO {
  pollId: string
  eligible: number
  voted: number
  notVoted: number
  attendance: AttendanceDTO
  /** 0-100, redondeado a un decimal. */
  participationRate: number
  includesChoices: boolean
  users: ParticipationUserDTO[]
}

// ---------------------------------------------------------------------------
// Dashboard y auditoria
// ---------------------------------------------------------------------------

export interface DashboardStatsDTO {
  polls: {
    total: number
    draft: number
    scheduled: number
    published: number
    active: number
    closed: number
    archived: number
  }
  users: {
    total: number
    active: number
    inactive: number
    admins: number
  }
  activePolls: Array<{
    id: string
    slug: string
    title: string
    status: PollStatus
    totalVotes: number
    eligibleVoters: number
    participationRate: number
    endsAt: string | null
  }>
  recentPolls: PollDTO[]
  /** Participacion media de las votaciones cerradas/archivadas, 0-100. */
  averageParticipation: number
}

export interface AuditLogDTO {
  id: string
  actorId: string | null
  actorUsername: string | null
  action: string
  entity: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

export interface PaginatedDTO<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// Errores de API
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: ErrorCode | string
    message: string
    details?: Record<string, string[]>
    retryAfterSeconds?: number
  }
}

// ---------------------------------------------------------------------------
// Encuestas
//
// Modulo aparte de las votaciones: varias preguntas por encuesta, de tipos
// distintos, y con la posibilidad de que sea anonima.
//
// El anonimato NO es un campo que la interfaz respete: cuando una encuesta es
// anonima, el servidor no guarda ninguna relacion entre la persona y su envio,
// asi que no hay nada que ocultar despues. Lo que si se guarda siempre es
// QUIEN participo, en una tabla sin vinculo con las respuestas.
// ---------------------------------------------------------------------------

export type SurveyStatus = PollStatus

/** Tipo de pregunta. Cada una define que se guarda como respuesta. */
export type SurveyQuestionType = 'SINGLE' | 'MULTIPLE' | 'TEXT' | 'SCALE'

export interface SurveyOptionDTO {
  id: string
  text: string
  position: number
}

export interface SurveyQuestionDTO {
  id: string
  position: number
  type: SurveyQuestionType
  text: string
  help: string | null
  required: boolean
  /** Solo en MULTIPLE. `null` significa "sin limite". */
  minChoices: number | null
  maxChoices: number | null
  /** Solo en SCALE. Por defecto del 1 al 10. */
  scaleMin: number
  scaleMax: number
  scaleMinLabel: string | null
  scaleMaxLabel: string | null
  /** Vacio en TEXT y SCALE. */
  options: SurveyOptionDTO[]
}

export interface SurveySettings {
  anonymous: boolean
  allowResponseChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
}

export interface SurveyDTO extends SurveySettings {
  id: string
  slug: string
  title: string
  description: string | null
  status: SurveyStatus
  startsAt: string | null
  endsAt: string | null
  publishedAt: string | null
  openedAt: string | null
  closedAt: string | null
  questionCount: number
  /** Cuantas personas han respondido. Visible siempre, tambien en anonimas. */
  responseCount: number | null
  createdAt: string
  updatedAt: string
}

export interface SurveyDetailDTO extends SurveyDTO {
  questions: SurveyQuestionDTO[]
  /** Cuentas con permiso para participar, para que el admin sepa el alcance. */
  eligibleCount: number
}

/** Una respuesta que envia el trabajador, ya normalizada. */
export type SurveyAnswerInput =
  | { questionId: string; optionIds: string[] }
  | { questionId: string; text: string }
  | { questionId: string; scale: number }

/** Lo que el trabajador ve de su propio envio. En anonimas es siempre null. */
export interface MySurveyResponseDTO {
  submittedAt: string
  changeCount: number
  answers: SurveyAnswerInput[]
}

export interface SurveyPermissionsDTO {
  canAnswer: boolean
  canChangeAnswer: boolean
  canViewResults: boolean
  blockReason: SurveyBlockReason | null
}

export type SurveyBlockReason =
  | 'NOT_OPEN'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'ALREADY_ANSWERED'
  | 'USER_INACTIVE'
  | 'NO_PERMISSION'

export interface SurveyViewDTO {
  survey: SurveyDTO
  questions: SurveyQuestionDTO[]
  /** `null` en una encuesta anonima aunque la persona ya haya respondido. */
  myResponse: MySurveyResponseDTO | null
  hasAnswered: boolean
  permissions: SurveyPermissionsDTO
  results: SurveyResultsDTO | null
  serverTime: string
}

// --- Resultados -------------------------------------------------------------

export interface SurveyOptionResultDTO {
  optionId: string
  text: string
  count: number
  /** Sobre el total de envios de la encuesta, 0-100 con un decimal. */
  percentage: number
}

export interface SurveyScaleResultDTO {
  average: number
  /** Cuantas respuestas hay en cada peldano, de `scaleMin` a `scaleMax`. */
  distribution: Array<{ value: number; count: number }>
}

export interface SurveyQuestionResultDTO {
  questionId: string
  text: string
  type: SurveyQuestionType
  answered: number
  options: SurveyOptionResultDTO[]
  scale: SurveyScaleResultDTO | null
  /**
   * Respuestas escritas, SOLO para administradores.
   *
   * Un recuento por opcion es una estadistica; un comentario es la respuesta
   * individual de alguien reproducida tal cual. Aunque no lleve firma, dejar
   * que la plantilla lea lo que escribieron sus companeros es enseñar lo que
   * respondio otro, que es justo lo que no debe pasar. Para el resto llega
   * vacio y el servidor ni siquiera consulta los textos.
   */
  texts: string[]
  /** Cuantas hay, para poder decirlo sin mostrarlas. */
  textCount: number
}

export interface SurveyResultsDTO {
  surveyId: string
  status: SurveyStatus
  anonymous: boolean
  submissions: number
  questions: SurveyQuestionResultDTO[]
  /**
   * Bloque de organizacion (censo y quien falta). Solo para ADMIN, igual que
   * en las votaciones. En las anonimas dice quien participo, nunca que dijo.
   */
  overview: SurveyOverviewDTO | null
  generatedAt: string
}

export interface SurveyOverviewDTO {
  eligible: number
  answered: number
  pending: number
  /** 0-100, redondeado a un decimal. */
  participationRate: number
  /**
   * Aviso de anonimato debil: con muy pocos envios, ver los resultados de una
   * encuesta anonima puede bastar para deducir quien dijo que.
   */
  anonymityAtRisk: boolean
}

export interface SurveyParticipantDTO {
  userId: string
  name: string
  username: string
  hasAnswered: boolean
  /** En anonimas se redondea al dia, para no servir de puente con el envio. */
  answeredAt: string | null
}

export interface SurveyParticipationDTO {
  surveyId: string
  anonymous: boolean
  eligible: number
  answered: number
  pending: number
  participationRate: number
  users: SurveyParticipantDTO[]
}

/**
 * Respuesta del enlace fijo de encuestas: que hay abierto ahora mismo.
 *
 * Se devuelve una lista porque nada impide tener dos encuestas abiertas a la
 * vez; lo normal es que haya una sola o ninguna.
 */
export interface ActiveSurveysDTO {
  surveys: Array<{
    id: string
    slug: string
    title: string
    anonymous: boolean
    questionCount: number
    endsAt: string | null
    hasAnswered: boolean
  }>
  /** Si esta persona tiene el permiso de participar. */
  canAnswer: boolean
  serverTime: string
}
