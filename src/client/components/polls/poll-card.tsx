import { motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, ChevronRight, Film, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { Badge } from '@/client/components/ui/badge'
import { Card } from '@/client/components/ui/card'
import { formatShortDateTime, pluralize } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import type { VoterPollSummaryDTO } from '@/shared/types'

const BLOCK_LABELS: Record<string, string> = {
  NOT_OPEN: 'Aun no abierta',
  NOT_STARTED: 'Comienza pronto',
  ENDED: 'Plazo terminado',
  CLOSED: 'Cerrada',
  ARCHIVED: 'Archivada',
  ALREADY_VOTED: 'Ya has votado',
  USER_INACTIVE: 'Cuenta inactiva',
}

/** Tarjeta de una votacion en la lista del trabajador. */
export function PollCard({ summary, index = 0 }: { summary: VoterPollSummaryDTO; index?: number }) {
  const { poll } = summary

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.25), ease: 'easeOut' }}
    >
      <Card
        className={cn(
          'group transition-[border-color,box-shadow] duration-200',
          'hover:border-foreground/25 hover:shadow-raised',
        )}
      >
        <Link
          to={'/app/votacion/' + poll.slug}
          className="flex items-start gap-4 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <PollStatusBadge status={poll.status} />
              {summary.hasVoted ? (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" />
                  Has votado
                </Badge>
              ) : summary.canVote ? (
                <Badge variant="info">Pendiente de votar</Badge>
              ) : summary.blockReason ? (
                <Badge variant="muted">{BLOCK_LABELS[summary.blockReason] ?? 'No disponible'}</Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold leading-tight text-balance">{poll.title}</h3>
              {poll.description ? (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {poll.description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Film className="size-3.5" aria-hidden="true" />
                {pluralize(poll.optionCount, 'pelicula', 'peliculas')}
              </span>

              {summary.canViewResults && poll.totalVotes !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  {pluralize(poll.totalVotes, 'voto', 'votos')}
                </span>
              ) : null}

              {poll.endsAt && poll.status === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Hasta {formatShortDateTime(poll.endsAt)}
                </span>
              ) : null}

              {poll.startsAt && poll.status === 'SCHEDULED' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Abre {formatShortDateTime(poll.startsAt)}
                </span>
              ) : null}
            </div>
          </div>

          <ChevronRight
            className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </Card>
    </motion.div>
  )
}
