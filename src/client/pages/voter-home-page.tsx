import { useQuery } from '@tanstack/react-query'
import { Plus, Popcorn } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/client/components/layout/app-shell'
import { PollCard } from '@/client/components/polls/poll-card'
import { EmptyState, ErrorState } from '@/client/components/common/states'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { useAuth } from '@/client/hooks/use-auth'
import { errorMessage } from '@/client/lib/api'
import { queryKeys, voterApi } from '@/client/lib/queries'

/** Lista de votaciones disponibles para el trabajador. */
export function VoterHomePage() {
  const { user, isAdmin } = useAuth()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.voterPolls,
    queryFn: () => voterApi.polls(),
    staleTime: 20_000,
  })

  const items = data?.items ?? []
  const pending = items.filter((item) => item.canVote)

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Hola{user ? ', ' + user.name.split(' ')[0] : ''}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {pending.length > 0 ? 'Tienes una votacion pendiente' : 'Tus votaciones'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pending.length > 0
              ? 'Elige tu pelicula antes de que se cierre el plazo.'
              : 'Aqui apareceran las votaciones en cuanto el administrador las publique.'}
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Popcorn}
            title="Todavia no hay votaciones"
            description={
              isAdmin
                ? 'Aqui solo aparecen las votaciones publicadas. Crea la primera desde el panel.'
                : 'Cuando el administrador publique una Movie Night la veras aqui.'
            }
            action={
              isAdmin ? (
                <Button asChild>
                  <Link to="/admin/votaciones/nueva">
                    <Plus />
                    Crear votacion
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((summary, index) => (
              <PollCard key={summary.poll.id} summary={summary} index={index} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
