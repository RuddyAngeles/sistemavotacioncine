import type { SurveyAnswerInput } from '@/shared/schemas'
import type {
  ActivePollsDTO,
  AuditLogDTO,
  DashboardStatsDTO,
  MyVoteDTO,
  PaginatedDTO,
  ParticipationDTO,
  PollDTO,
  PollDetailDTO,
  PollOptionDTO,
  ResultsDTO,
  UserDTO,
  VoterPollSummaryDTO,
  VoterPollViewDTO,
  SurveyDTO,
  SurveyDetailDTO,
  SurveyResultsDTO,
  SurveyParticipationDTO,
  SurveyViewDTO,
  ActiveSurveysDTO,
} from '@/shared/types'
import { api } from './api'

/**
 * Claves de cache y llamadas a la API en un solo sitio.
 * Al invalidar, las paginas usan estas mismas claves, de modo que no hay
 * cadenas sueltas repartidas por los componentes.
 */
export const queryKeys = {
  auth: ['auth', 'me'] as const,
  dashboard: ['dashboard', 'stats'] as const,
  users: (filters: Record<string, unknown> = {}) => ['users', filters] as const,
  user: (id: string) => ['users', id] as const,
  polls: (filters: Record<string, unknown> = {}) => ['polls', filters] as const,
  poll: (id: string) => ['polls', id] as const,
  pollResults: (id: string) => ['polls', id, 'results'] as const,
  pollParticipation: (id: string, includeChoices: boolean) =>
    ['polls', id, 'participation', includeChoices] as const,
  myVote: (id: string) => ['polls', id, 'my-vote'] as const,
  voterPolls: ['me', 'polls'] as const,
  activePoll: ['me', 'active-poll'] as const,
  voterPoll: (slug: string) => ['me', 'polls', slug] as const,
  audit: (filters: Record<string, unknown> = {}) => ['audit-logs', filters] as const,
}

function toQueryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query.length > 0 ? '?' + query : ''
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export interface UserFilters {
  q?: string
  status?: string
  role?: string
  page?: number
  pageSize?: number
}

export const usersApi = {
  list: (filters: UserFilters = {}) =>
    api.get<PaginatedDTO<UserDTO>>('/users' + toQueryString(filters)),
  get: (id: string) => api.get<{ user: UserDTO }>('/users/' + id),
  create: (body: unknown) => api.post<{ user: UserDTO }>('/users', body),
  update: (id: string, body: unknown) => api.patch<{ user: UserDTO }>('/users/' + id, body),
  remove: (id: string) => api.delete<{ ok: true }>('/users/' + id),
  resetPassword: (id: string, body: unknown) =>
    api.post<{ ok: true }>('/users/' + id + '/reset-password', body),
}

// ---------------------------------------------------------------------------
// Votaciones (administracion)
// ---------------------------------------------------------------------------

export interface PollFilters {
  q?: string
  status?: string
  scope?: 'all' | 'live' | 'history'
  page?: number
  pageSize?: number
}

export type PollTransitionName =
  | 'publish'
  | 'open'
  | 'close'
  | 'archive'
  | 'reopen'
  | 'back-to-draft'

export const pollsApi = {
  list: (filters: PollFilters = {}) =>
    api.get<PaginatedDTO<PollDTO>>('/polls' + toQueryString(filters)),
  get: (id: string) => api.get<PollDetailDTO>('/polls/' + id),
  create: (body: unknown) => api.post<PollDetailDTO>('/polls', body),
  update: (id: string, body: unknown) => api.patch<PollDetailDTO>('/polls/' + id, body),
  remove: (id: string) => api.delete<{ ok: true }>('/polls/' + id),
  transition: (id: string, transition: PollTransitionName) =>
    api.post<PollDetailDTO>('/polls/' + id + '/' + transition),
  duplicate: (id: string, title?: string) =>
    api.post<PollDetailDTO>('/polls/' + id + '/duplicate', title ? { title } : {}),

  addOption: (pollId: string, body: unknown) =>
    api.post<{ option: PollOptionDTO }>('/polls/' + pollId + '/options', body),
  updateOption: (pollId: string, optionId: string, body: unknown) =>
    api.patch<{ option: PollOptionDTO }>('/polls/' + pollId + '/options/' + optionId, body),
  removeOption: (pollId: string, optionId: string) =>
    api.delete<{ ok: true }>('/polls/' + pollId + '/options/' + optionId),
  reorderOptions: (pollId: string, optionIds: string[]) =>
    api.patch<{ options: PollOptionDTO[] }>('/polls/' + pollId + '/options/reorder', { optionIds }),

  results: (id: string) => api.get<{ results: ResultsDTO }>('/polls/' + id + '/results'),
  participation: (id: string, includeChoices: boolean) =>
    api.get<{ participation: ParticipationDTO }>(
      '/polls/' + id + '/participation' + (includeChoices ? '?includeChoices=true' : ''),
    ),

  uploadPoster: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<{ key: string; url: string }>('/uploads/poster', formData)
  },
}

// ---------------------------------------------------------------------------
// Votaciones (trabajador)
// ---------------------------------------------------------------------------

export const voterApi = {
  /** Soporte del enlace fijo /votar. */
  activePolls: () => api.get<ActivePollsDTO>('/me/active-poll'),
  polls: () => api.get<{ items: VoterPollSummaryDTO[] }>('/me/polls'),
  poll: (slug: string) => api.get<VoterPollViewDTO>('/me/polls/' + slug),
  myVote: (pollId: string) => api.get<{ vote: MyVoteDTO | null }>('/polls/' + pollId + '/my-vote'),
  vote: (pollId: string, optionId: string) =>
    api.post<{ vote: MyVoteDTO }>('/polls/' + pollId + '/vote', { optionId }),
  changeVote: (pollId: string, optionId: string) =>
    api.patch<{ vote: MyVoteDTO }>('/polls/' + pollId + '/vote', { optionId }),

  /** Responder "no asistire" en lugar de elegir pelicula. */
  voteNotAttending: (pollId: string) =>
    api.post<{ vote: MyVoteDTO }>('/polls/' + pollId + '/vote', { notAttending: true }),
  changeToNotAttending: (pollId: string) =>
    api.patch<{ vote: MyVoteDTO }>('/polls/' + pollId + '/vote', { notAttending: true }),
}

// ---------------------------------------------------------------------------
// Panel y auditoria
// ---------------------------------------------------------------------------

export const dashboardApi = {
  stats: () => api.get<DashboardStatsDTO>('/dashboard/stats'),
}

export interface AuditFilters {
  action?: string
  entity?: string
  actorId?: string
  page?: number
  pageSize?: number
}

export const auditApi = {
  list: (filters: AuditFilters = {}) =>
    api.get<PaginatedDTO<AuditLogDTO>>('/audit-logs' + toQueryString(filters)),
}

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------

export interface SurveyFilters {
  status?: string
  search?: string
  page?: number
  pageSize?: number
}

export const surveysApi = {
  list: (filters: SurveyFilters = {}) =>
    api.get<PaginatedDTO<SurveyDTO>>('/surveys' + toQueryString(filters)),
  get: (id: string) => api.get<SurveyDetailDTO>('/surveys/' + id),
  create: (payload: unknown) => api.post<SurveyDetailDTO>('/surveys', payload),
  update: (id: string, payload: unknown) => api.patch<SurveyDetailDTO>('/surveys/' + id, payload),
  remove: (id: string, descartar = false) =>
    api.delete<void>('/surveys/' + id + (descartar ? '?descartarRespuestas=true' : '')),

  transition: (id: string, accion: 'publish' | 'open' | 'close' | 'archive' | 'reopen') =>
    api.post<SurveyDetailDTO>('/surveys/' + id + '/' + accion, {}),

  addQuestion: (id: string, payload: unknown) =>
    api.post<SurveyDetailDTO>('/surveys/' + id + '/questions', payload),
  /*
   * "descartar" solo hace falta cuando el cambio borraria respuestas ya
   * recibidas. Sin el, el servidor responde 409 diciendo cuantas se
   * perderian, y la pantalla lo pregunta antes de insistir.
   */
  updateQuestion: (id: string, questionId: string, payload: unknown, descartar = false) =>
    api.put<SurveyDetailDTO>(
      '/surveys/' + id + '/questions/' + questionId + (descartar ? '?descartarRespuestas=true' : ''),
      payload,
    ),
  removeQuestion: (id: string, questionId: string, descartar = false) =>
    api.delete<SurveyDetailDTO>(
      '/surveys/' + id + '/questions/' + questionId + (descartar ? '?descartarRespuestas=true' : ''),
    ),

  results: (id: string) => api.get<{ results: SurveyResultsDTO }>('/surveys/' + id + '/results'),
  participation: (id: string) =>
    api.get<{ participation: SurveyParticipationDTO }>('/surveys/' + id + '/participation'),

  /** Activa o retira el permiso de participacion en bloque. */
  setPermission: (canAnswerSurveys: boolean, userIds?: string[]) =>
    api.post<{ updated: number }>('/surveys/permissions/bulk', { canAnswerSurveys, userIds }),
}

/** Encuestas desde el lado de quien responde. */
export const mySurveysApi = {
  list: () => api.get<{ items: VoterSurveySummary[] }>('/me/surveys'),
  /** Enlace fijo /responder: que encuestas hay abiertas ahora mismo. */
  abiertas: () => api.get<ActiveSurveysDTO>('/me/surveys/abiertas/ahora'),
  get: (slug: string) => api.get<SurveyViewDTO>('/me/surveys/' + slug),
  submit: (slug: string, answers: SurveyAnswerInput[]) =>
    api.post<{ ok: true; changed: boolean }>('/me/surveys/' + slug + '/respuestas', { answers }),
}

export interface VoterSurveySummary {
  survey: SurveyDTO
  hasAnswered: boolean
  canAnswer: boolean
  canChangeAnswer: boolean
  blockReason: string | null
}

export const surveyKeys = {
  all: ['surveys'] as const,
  detail: (id: string) => ['surveys', id] as const,
  results: (id: string) => ['surveys', id, 'results'] as const,
  participation: (id: string) => ['surveys', id, 'participation'] as const,
  mine: ['my-surveys'] as const,
  mineDetail: (slug: string) => ['my-surveys', slug] as const,
  abiertas: ['my-surveys', 'abiertas'] as const,
}
