import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  UserMinus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState, LoadingState } from '@/client/components/common/states'
import { AppShell } from '@/client/components/layout/app-shell'
import { AttendanceSummary } from '@/client/components/polls/attendance-summary'
import { MovieCard } from '@/client/components/polls/movie-card'
import { MoviePoster } from '@/client/components/polls/movie-poster'
import { NotAttendingCard } from '@/client/components/polls/not-attending-card'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { ResultsChart, ResultsHidden } from '@/client/components/polls/results'
import { VoteConfirmation } from '@/client/components/polls/vote-confirmation'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { errorMessage } from '@/client/lib/api'
import { formatDateTime } from '@/client/lib/format'
import { queryKeys, voterApi } from '@/client/lib/queries'
import type { PollOptionDTO, VoteBlockReason } from '@/shared/types'

/** Refresco moderado de resultados en vivo: suficiente y barato. */
const LIVE_REFRESH_MS = 15_000

/** Lo que el usuario esta a punto de confirmar. */
type Choice = { kind: 'option'; option: PollOptionDTO } | { kind: 'not-attending' }

const BLOCK_COPY: Record<VoteBlockReason, { title: string; description: string }> = {
  NOT_OPEN: {
    title: 'La votacion todavia no esta abierta',
    description: 'El administrador la abrira cuando llegue el momento. Vuelve mas tarde.',
  },
  NOT_STARTED: {
    title: 'La votacion aun no ha comenzado',
    description: 'Podras votar a partir de la hora de inicio programada.',
  },
  ENDED: {
    title: 'El plazo de votacion ha terminado',
    description: 'Ya no se admiten nuevos votos.',
  },
  CLOSED: {
    title: 'La votacion esta cerrada',
    description: 'Ya no se admiten nuevos votos.',
  },
  ARCHIVED: {
    title: 'La votacion esta archivada',
    description: 'Se conserva en el historial, pero no admite votos.',
  },
  ALREADY_VOTED: {
    title: 'Ya has respondido',
    description: 'Esta votacion no permite cambiar la respuesta una vez enviada.',
  },
  USER_INACTIVE: {
    title: 'Tu cuenta no esta activa',
    description: 'Contacta con el administrador para recuperar el acceso.',
  },
}

export function VotePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<Choice | null>(null)
  const [changing, setChanging] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.voterPoll(slug),
    queryFn: () => voterApi.poll(slug),
    enabled: slug.length > 0,
    staleTime: 10_000,
    // Solo se refresca solo cuando hay algo que refrescar: resultados en vivo
    // de una votacion abierta. Evita trafico innecesario y consumo de cuota.
    refetchInterval: (query) => {
      const view = query.state.data
      if (!view) return false
      return view.poll.status === 'ACTIVE' && view.permissions.canViewResults
        ? LIVE_REFRESH_MS
        : false
    },
  })

  const myOption = useMemo(() => {
    if (!data?.myVote?.optionId) return null
    return data.options.find((option) => option.id === data.myVote?.optionId) ?? null
  }, [data])

  const voteMutation = useMutation({
    mutationFn: async (choice: Choice) => {
      if (!data) throw new Error('Votacion no cargada')
      const yaVoto = data.myVote !== null

      if (choice.kind === 'not-attending') {
        return yaVoto
          ? voterApi.changeToNotAttending(data.poll.id)
          : voterApi.voteNotAttending(data.poll.id)
      }
      return yaVoto
        ? voterApi.changeVote(data.poll.id, choice.option.id)
        : voterApi.vote(data.poll.id, choice.option.id)
    },
    onSuccess: async (_result, choice) => {
      setSelected(null)
      setChanging(false)
      toast.success(data?.myVote ? 'Respuesta actualizada' : 'Respuesta registrada', {
        description: choice.kind === 'option' ? choice.option.title : 'No asistiras',
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.voterPoll(slug) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.voterPolls })
    },
    onError: async (mutationError) => {
      toast.error(errorMessage(mutationError, 'No se ha podido registrar la respuesta'))
      // El estado del servidor manda: recargamos para reflejar la realidad.
      await queryClient.invalidateQueries({ queryKey: queryKeys.voterPoll(slug) })
    },
  })

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState label="Cargando votacion…" />
      </AppShell>
    )
  }

  if (isError || !data) {
    return (
      <AppShell>
        <ErrorState
          title="No se ha podido abrir la votacion"
          message={errorMessage(error, 'Es posible que ya no exista')}
          onRetry={() => void refetch()}
        />
      </AppShell>
    )
  }

  const { poll, options, myVote, permissions, results } = data
  const canPickNew = permissions.canVote
  const canChange = permissions.canChangeVote
  const showPicker = canPickNew || (canChange && changing)
  const block = permissions.blockReason ? BLOCK_COPY[permissions.blockReason] : null
  const noAsiste = myVote !== null && !myVote.attending

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <Link
            to="/app"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PollStatusBadge status={poll.status} />
            {poll.endsAt && poll.status === 'ACTIVE' ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                Cierra el {formatDateTime(poll.endsAt)}
              </span>
            ) : null}
            {poll.startsAt && poll.status === 'SCHEDULED' ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                Abre el {formatDateTime(poll.startsAt)}
              </span>
            ) : null}
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {poll.title}
          </h1>
          {poll.description ? (
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
              {poll.description}
            </p>
          ) : null}
        </header>

        {/* Respuesta ya enviada */}
        <AnimatePresence mode="wait">
          {myVote && !showPicker ? (
            <motion.div
              key="my-vote"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Card className={noAsiste ? '' : 'border-success/30 bg-success/5'}>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {noAsiste ? (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserMinus className="size-6" aria-hidden="true" />
                    </span>
                  ) : (
                    <MoviePoster
                      src={myOption?.posterUrl ?? null}
                      alt={myOption?.title ?? ''}
                      className="w-20 shrink-0 rounded-lg border border-border"
                    />
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <p
                      className={
                        noAsiste
                          ? 'inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground'
                          : 'inline-flex items-center gap-1.5 text-sm font-medium text-success'
                      }
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Respuesta registrada
                    </p>
                    <p className="text-xl font-semibold leading-tight">
                      {noAsiste ? 'No asistiras' : (myOption?.title ?? myVote.optionTitle)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {canChange
                        ? 'Puedes cambiarla mientras la votacion siga abierta.'
                        : 'Esta votacion no permite cambiar la respuesta.'}
                    </p>
                  </div>

                  {canChange ? (
                    <Button variant="outline" className="shrink-0" onClick={() => setChanging(true)}>
                      <RefreshCw />
                      Cambiar respuesta
                    </Button>
                  ) : (
                    <Lock className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Motivo por el que no se puede votar */}
        {block && !myVote ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">{block.title}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{block.description}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Cartelera */}
        {showPicker ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                {changing ? 'Cambia tu respuesta' : 'Que pelicula quieres ver?'}
              </h2>
              {changing ? (
                <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>
                  Cancelar
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option, index) => (
                <MovieCard
                  key={option.id}
                  option={option}
                  index={index}
                  selected={myVote?.optionId === option.id}
                  disabled={voteMutation.isPending}
                  actionLabel={changing ? 'Elegir esta' : 'Elegir pelicula'}
                  onSelect={(chosen) => setSelected({ kind: 'option', option: chosen })}
                />
              ))}
            </div>

            {poll.allowNotAttending ? (
              <NotAttendingCard
                selected={noAsiste}
                disabled={voteMutation.isPending}
                onSelect={() => setSelected({ kind: 'not-attending' })}
              />
            ) : null}
          </section>
        ) : null}

        {/* Cartelera en modo consulta cuando ya no se puede votar */}
        {!showPicker && !myVote && options.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Cartelera</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option, index) => (
                <MovieCard key={option.id} option={option} index={index} selected={false} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Resultados */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Resultados</h2>
            {permissions.canViewResults && poll.status === 'ACTIVE' ? (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {isFetching ? 'Actualizando…' : 'En vivo'}
              </span>
            ) : null}
          </div>

          {results ? (
            <>
              {/*
                El resumen de asistencia solo llega a los administradores: el
                servidor no envia `overview` a un trabajador. Aqui no se
                oculta nada, sencillamente no hay datos que pintar.
              */}
              {results.overview ? (
                <AttendanceSummary
                  attendance={results.overview.attendance}
                  closed={poll.status === 'CLOSED' || poll.status === 'ARCHIVED'}
                />
              ) : null}

              <ResultsChart
                results={results}
                myOptionId={myVote?.optionId ?? null}
                title={poll.status === 'ACTIVE' ? 'Resultados actuales' : 'Resultado final'}
              />
            </>
          ) : (
            <ResultsHidden closed={poll.status === 'CLOSED' || poll.status === 'ARCHIVED'} />
          )}
        </section>
      </div>

      <VoteConfirmation
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        choice={selected}
        currentOption={myOption}
        currentIsNotAttending={noAsiste}
        hasVoted={myVote !== null}
        loading={voteMutation.isPending}
        onConfirm={() => {
          if (selected) voteMutation.mutate(selected)
        }}
      />
    </AppShell>
  )
}
