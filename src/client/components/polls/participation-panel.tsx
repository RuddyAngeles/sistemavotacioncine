import { Check, Circle, Eye, EyeOff, Search, ShieldAlert, UserMinus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { formatPercentage, formatShortDateTime } from '@/client/lib/format'
import type { ParticipationDTO } from '@/shared/types'

interface ParticipationPanelProps {
  participation: ParticipationDTO
  showChoices: boolean
  loadingChoices?: boolean
  onToggleChoices: (next: boolean) => void
}

/**
 * Participacion por persona.
 *
 * Por defecto solo indica QUIEN ha votado, no QUE ha votado. Revelar las
 * elecciones individuales es una accion deliberada del administrador y queda
 * registrada en la auditoria.
 */
export function ParticipationPanel({
  participation,
  showChoices,
  loadingChoices = false,
  onToggleChoices,
}: ParticipationPanelProps) {
  const [search, setSearch] = useState('')

  const users = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return participation.users
    return participation.users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) || user.username.toLowerCase().includes(term),
    )
  }, [participation.users, search])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Participacion</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {participation.voted} de {participation.eligible} han respondido ·{' '}
              {formatPercentage(participation.participationRate)}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={loadingChoices}
            onClick={() => onToggleChoices(!showChoices)}
          >
            {showChoices ? <EyeOff /> : <Eye />}
            {showChoices ? 'Ocultar elecciones' : 'Ver elecciones'}
          </Button>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-[width] duration-500"
            style={{ width: participation.participationRate + '%' }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {showChoices ? (
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Estas viendo el voto individual de cada persona. Es informacion confidencial de
              gestion: no debe compartirse con los trabajadores. La consulta ha quedado registrada
              en la auditoria.
            </p>
          </div>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar persona…"
            className="pl-9"
            aria-label="Buscar en la lista de participacion"
          />
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {users.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No hay coincidencias.
            </li>
          ) : (
            users.map((user) => (
              <li key={user.userId} className="flex items-center gap-3 px-4 py-3">
                {user.attending === true ? (
                  <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : user.attending === false ? (
                  <UserMinus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {user.username}
                  </p>
                </div>

                {/* Quien asiste y quien no es informacion de organizacion:
                    se ve siempre. La pelicula concreta, solo bajo peticion. */}
                {user.attending === false ? (
                  <Badge variant="muted" className="shrink-0">
                    No asiste
                  </Badge>
                ) : showChoices && user.attending === true ? (
                  <Badge variant="secondary" className="max-w-40 truncate">
                    {user.choiceTitle ?? 'Sin registrar'}
                  </Badge>
                ) : null}

                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {user.hasVoted ? formatShortDateTime(user.votedAt) : 'Sin responder'}
                </span>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
