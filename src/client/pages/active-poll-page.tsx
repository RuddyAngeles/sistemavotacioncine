import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, ChevronRight, Loader2, Popcorn } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { ErrorState } from '@/client/components/common/states'
import { AppShell } from '@/client/components/layout/app-shell'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card } from '@/client/components/ui/card'
import { errorMessage } from '@/client/lib/api'
import { formatDateTime } from '@/client/lib/format'
import { queryKeys, voterApi } from '@/client/lib/queries'

/**
 * Enlace fijo: `/votar`.
 *
 * Es la unica direccion que el administrador necesita repartir. Siempre
 * lleva a la votacion abierta en ese momento, sea cual sea, sin tener que
 * compartir un enlace nuevo cada mes.
 *
 * Quien entre sin sesion acaba en el login y vuelve aqui automaticamente.
 */
export function ActivePollPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.activePoll,
    queryFn: () => voterApi.activePolls(),
    // El estado cambia cuando el administrador abre o cierra: no conviene
    // servir una respuesta vieja desde la cache.
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Buscando la votacion abierta…</p>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <AppShell>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </AppShell>
    )
  }

  // Caso normal: una sola votacion abierta. Se entra directamente a votar.
  if (data.polls.length === 1) {
    const poll = data.polls[0]
    if (poll) return <Navigate to={'/app/votacion/' + poll.slug} replace />
  }

  // Varias abiertas a la vez: que elija el trabajador.
  if (data.polls.length > 1) {
    return (
      <AppShell>
        <div className="space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Hay varias votaciones abiertas</h1>
            <p className="text-sm text-muted-foreground">Elige en cual quieres participar.</p>
          </header>

          <div className="space-y-3">
            {data.polls.map((poll) => (
              <Card key={poll.id} className="transition-colors hover:border-foreground/25">
                <Link
                  to={'/app/votacion/' + poll.slug}
                  className="flex items-center gap-4 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success">Abierta</Badge>
                      {poll.hasVoted ? (
                        <Badge variant="muted">
                          <CheckCircle2 className="size-3" />
                          Ya has votado
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="truncate font-semibold">{poll.title}</h2>
                    {poll.endsAt ? (
                      <p className="text-xs text-muted-foreground">
                        Cierra el {formatDateTime(poll.endsAt)}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    )
  }

  // Ninguna abierta: se explica, en lugar de dejar una pantalla vacia.
  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Popcorn className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            No hay ninguna votacion abierta
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ahora mismo no se puede votar. Este enlace seguira siendo el mismo: vuelve a abrirlo
            cuando se anuncie la proxima Movie Night y entraras directo a ella.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => void refetch()}>
            <CalendarClock />
            Comprobar de nuevo
          </Button>
          <Button asChild variant="ghost">
            <Link to="/app">Ver votaciones anteriores</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
