import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, FileEdit, Pin, Plus, TrendingUp, Users, Vote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CopyField } from '@/client/components/common/copy-field'
import { PageHeader } from '@/client/components/common/page-header'
import { StatCard } from '@/client/components/common/stat-card'
import { EmptyState, ErrorState } from '@/client/components/common/states'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Skeleton } from '@/client/components/ui/skeleton'
import { errorMessage } from '@/client/lib/api'
import { formatPercentage, formatRelative, formatShortDateTime, pluralize } from '@/client/lib/format'
import { dashboardApi, queryKeys } from '@/client/lib/queries'

/** Panel de administracion: estado general del sistema de un vistazo. */
export function DashboardPage() {
  const origin = window.location.origin

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => dashboardApi.stats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Panel"
        description="Resumen de las votaciones, los usuarios y la participacion."
        actions={
          <Button asChild>
            <Link to="/admin/votaciones/nueva">
              <Plus />
              Nueva votacion
            </Link>
          </Button>
        }
      />

      {/*
        El enlace fijo se reparte una sola vez, asi que conviene tenerlo
        siempre visible y no solo dentro del dialogo de una votacion.
      */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              <Pin className="size-4 text-primary" aria-hidden="true" />
              Enlace para los trabajadores
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Repartelo una vez: siempre lleva a la votacion abierta en ese momento.
            </p>
          </div>

          <CopyField
            id="enlace-fijo-panel"
            value={origin + '/votar'}
            highlighted
            className="w-full sm:max-w-md"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              index={0}
              label="Votaciones"
              value={data.polls.total}
              icon={Vote}
              hint={
                data.polls.draft + ' en borrador · ' + data.polls.closed + ' cerradas'
              }
            />
            <StatCard
              index={1}
              label="Usuarios activos"
              value={data.users.active}
              icon={Users}
              hint={
                data.users.total +
                ' en total · ' +
                pluralize(data.users.admins, 'administrador', 'administradores')
              }
            />
            <StatCard
              index={2}
              label="Votaciones activas"
              value={data.polls.active}
              icon={Activity}
              accent={data.polls.active > 0 ? 'success' : 'default'}
              hint={
                data.polls.scheduled > 0
                  ? data.polls.scheduled + ' programadas'
                  : 'Sin votaciones programadas'
              }
            />
            <StatCard
              index={3}
              label="Participacion media"
              value={formatPercentage(data.averageParticipation)}
              icon={TrendingUp}
              accent="info"
              hint="Sobre las votaciones ya terminadas"
            />
          </div>

          {data.activePolls.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">En curso ahora</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.activePolls.map((poll) => (
                  <Card key={poll.id} className="border-success/30">
                    <CardContent className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <PollStatusBadge status={poll.status} />
                          <h3 className="truncate font-semibold">{poll.title}</h3>
                          {poll.endsAt ? (
                            <p className="text-xs text-muted-foreground">
                              Cierra el {formatShortDateTime(poll.endsAt)}
                            </p>
                          ) : null}
                        </div>
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <Link to={'/admin/votaciones/' + poll.id}>Gestionar</Link>
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-muted-foreground">Participacion</span>
                          <span className="font-semibold tabular-nums">
                            {poll.totalVotes} / {poll.eligibleVoters} ·{' '}
                            {formatPercentage(poll.participationRate)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-success transition-[width] duration-500"
                            style={{ width: poll.participationRate + '%' }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Ultimas votaciones</h2>

            {data.recentPolls.length === 0 ? (
              <EmptyState
                icon={FileEdit}
                title="Todavia no has creado ninguna votacion"
                description="Crea una Movie Night, agrega las peliculas y publicala cuando este lista."
                action={
                  <Button asChild>
                    <Link to="/admin/votaciones/nueva">
                      <Plus />
                      Nueva votacion
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Creadas recientemente
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-0">
                  <ul className="divide-y divide-border">
                    {data.recentPolls.map((poll) => (
                      <li key={poll.id}>
                        <Link
                          to={'/admin/votaciones/' + poll.id}
                          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{poll.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {pluralize(poll.optionCount, 'pelicula', 'peliculas')} ·{' '}
                              {formatRelative(poll.createdAt)}
                            </p>
                          </div>

                          {poll.totalVotes !== null && poll.totalVotes > 0 ? (
                            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                              <CheckCircle2 className="size-3.5" />
                              {pluralize(poll.totalVotes, 'voto', 'votos')}
                            </span>
                          ) : null}

                          <PollStatusBadge status={poll.status} showIcon={false} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}
