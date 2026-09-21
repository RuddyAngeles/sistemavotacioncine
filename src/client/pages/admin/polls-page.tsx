import { useQuery } from '@tanstack/react-query'
import { Archive, Film, Plus, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/client/components/common/page-header'
import { Pagination } from '@/client/components/common/pagination'
import { EmptyState, ErrorState } from '@/client/components/common/states'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { Button } from '@/client/components/ui/button'
import { Card } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Skeleton } from '@/client/components/ui/skeleton'
import { errorMessage } from '@/client/lib/api'
import { formatRelative, formatShortDateTime, pluralize } from '@/client/lib/format'
import { pollsApi, queryKeys, type PollFilters } from '@/client/lib/queries'
import { POLL_STATUSES } from '@/shared/constants'

const PAGE_SIZE = 50

function PollsList({ scope }: { scope: 'live' | 'history' }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)

  const filters: PollFilters = {
    scope,
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.polls(filters as Record<string, unknown>),
    queryFn: () => pollsApi.list(filters),
    staleTime: 15_000,
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por titulo…"
            className="pl-9"
            aria-label="Buscar votaciones"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-52" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {POLL_STATUSES.filter((value) =>
              scope === 'history' ? value === 'CLOSED' || value === 'ARCHIVED' : true,
            ).map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={scope === 'history' ? Archive : Film}
          title={
            search || status !== 'all'
              ? 'Sin resultados'
              : scope === 'history'
                ? 'El historial esta vacio'
                : 'Todavia no hay votaciones'
          }
          description={
            search || status !== 'all'
              ? 'Prueba con otros filtros.'
              : scope === 'history'
                ? 'Aqui apareceran las votaciones cerradas y archivadas.'
                : 'Crea la primera Movie Night para empezar.'
          }
          action={
            scope === 'live' && !search && status === 'all' ? (
              <Button asChild>
                <Link to="/admin/votaciones/nueva">
                  <Plus />
                  Nueva votacion
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
          {items.map((poll) => (
            <li key={poll.id}>
              <Card className="transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 hover:shadow-raised">
                <Link
                  to={'/admin/votaciones/' + poll.id}
                  className="flex flex-col gap-3 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PollStatusBadge status={poll.status} />
                      <span className="font-mono text-xs text-muted-foreground">/{poll.slug}</span>
                    </div>
                    <h3 className="truncate font-semibold">{poll.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Creada {formatRelative(poll.createdAt)}
                      {poll.closedAt ? ' · cerrada el ' + formatShortDateTime(poll.closedAt) : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-5 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Film className="size-4" aria-hidden="true" />
                      {pluralize(poll.optionCount, 'pelicula', 'peliculas')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-4" aria-hidden="true" />
                      {pluralize(poll.totalVotes ?? 0, 'voto', 'votos')}
                    </span>
                  </div>
                </Link>
              </Card>
            </li>
          ))}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? items.length}
            label="votaciones"
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

export function PollsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Votaciones"
        description="Crea, prepara y controla las votaciones de la empresa."
        actions={
          <Button asChild>
            <Link to="/admin/votaciones/nueva">
              <Plus />
              Nueva votacion
            </Link>
          </Button>
        }
      />
      <PollsList scope="live" />
    </div>
  )
}

export function HistoryPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Historial"
        description="Votaciones cerradas y archivadas. Los resultados se conservan, pero ya no admiten votos."
      />
      <PollsList scope="history" />
    </div>
  )
}
