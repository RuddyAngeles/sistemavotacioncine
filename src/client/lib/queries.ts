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
