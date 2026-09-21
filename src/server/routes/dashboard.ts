import { Hono } from 'hono'
import { percentage } from '../../shared/policy'
import { listAuditQuerySchema } from '../../shared/schemas'
import type { AuditLogDTO, DashboardStatsDTO, PaginatedDTO } from '../../shared/types'
import { listAuditLogs, toAuditLogDTO } from '../db/audit'
import { listActivePolls, listRecentPolls, pollStatusCounts, toPollDTO } from '../db/polls'
import { countEligibleVoters, userStats } from '../db/users'
import { averageParticipation } from '../db/votes'
import type { AppEnv } from '../env'
import { parseQuery } from '../lib/validate'
import { requireAdmin, requireFreshPassword } from '../middleware/auth'
import { syncPollStatus } from '../services/polls'

export const dashboardRoutes = new Hono<AppEnv>()

dashboardRoutes.use('*', requireAdmin, requireFreshPassword)

/** GET /api/dashboard/stats */
dashboardRoutes.get('/stats', async (c) => {
  const db = c.env.DB
  const now = new Date()

  // Antes de contar, ponemos al dia las votaciones programadas.
  const activeCandidates = await listActivePolls(db)
  for (const poll of activeCandidates) {
    await syncPollStatus(db, poll, now)
  }

  const [counts, users, eligibleVoters, recent, active, average] = await Promise.all([
    pollStatusCounts(db),
    userStats(db),
    countEligibleVoters(db),
    listRecentPolls(db, 5),
    listActivePolls(db),
    averageParticipation(db),
  ])

  const payload: DashboardStatsDTO = {
    polls: {
      total: counts.total,
      draft: counts.DRAFT,
      scheduled: counts.SCHEDULED,
      published: counts.PUBLISHED,
      active: counts.ACTIVE,
      closed: counts.CLOSED,
      archived: counts.ARCHIVED,
    },
    users,
    activePolls: active.map((poll) => ({
      id: poll.id,
      slug: poll.slug,
      title: poll.title,
      status: poll.status,
      totalVotes: poll.total_votes,
      eligibleVoters,
      participationRate: percentage(poll.total_votes, eligibleVoters),
      endsAt: poll.ends_at,
    })),
    recentPolls: recent.map(toPollDTO),
    averageParticipation: Math.round(average * 1000) / 10,
  }

  return c.json(payload)
})

/** GET /api/audit-logs */
export const auditRoutes = new Hono<AppEnv>()

auditRoutes.use('*', requireAdmin, requireFreshPassword)

auditRoutes.get('/', async (c) => {
  const query = parseQuery(c, listAuditQuerySchema)
  const { items, total } = await listAuditLogs(c.env.DB, query)

  const payload: PaginatedDTO<AuditLogDTO> = {
    items: items.map(toAuditLogDTO),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return c.json(payload)
})
