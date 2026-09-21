import { ArrowRight, Loader2, UserMinus } from 'lucide-react'
import { MoviePoster } from '@/client/components/polls/movie-poster'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import type { PollOptionDTO } from '@/shared/types'

/** Lo que se va a confirmar: una pelicula, o no asistir. */
export type VoteChoice = { kind: 'option'; option: PollOptionDTO } | { kind: 'not-attending' }

interface VoteConfirmationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  choice: VoteChoice | null
  /** Pelicula votada ahora mismo, si la hay. */
  currentOption?: PollOptionDTO | null
  /** La respuesta actual es "no asistire". */
  currentIsNotAttending?: boolean
  hasVoted?: boolean
  loading?: boolean
  onConfirm: () => void
}

/** Recuadro con la respuesta "no asistire", para el antes/despues. */
function NotAttendingTile({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div
      className={
        'flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted text-muted-foreground' +
        (dimmed ? ' opacity-60' : '')
      }
    >
      <UserMinus className="size-6" aria-hidden="true" />
      <span className="px-2 text-center text-xs font-medium">No asistire</span>
    </div>
  )
}

/**
 * Confirmacion de la respuesta.
 *
 * Si ya habia una, se muestran las dos (la actual y la nueva) para que el
 * cambio sea evidente antes de confirmarlo. Funciona igual eligiendo
 * pelicula que marcando "no asistire".
 */
export function VoteConfirmation({
  open,
  onOpenChange,
  choice,
  currentOption = null,
  currentIsNotAttending = false,
  hasVoted = false,
  loading = false,
  onConfirm,
}: VoteConfirmationProps) {
  if (!choice) return null

  const eligeNoAsistir = choice.kind === 'not-attending'
  const mismaRespuesta = eligeNoAsistir
    ? currentIsNotAttending
    : currentOption?.id === choice.option.id
  const esCambio = hasVoted && !mismaRespuesta

  const titulo = esCambio
    ? 'Cambiar tu respuesta'
    : eligeNoAsistir
      ? 'Confirmar que no asistiras'
      : 'Confirmar tu voto'

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {esCambio
              ? 'Tu respuesta anterior se sustituira por la nueva. Solo se guarda una por persona.'
              : eligeNoAsistir
                ? 'Contaras como que no asistes. No sumaras a ninguna pelicula.'
                : 'Revisa tu eleccion antes de confirmarla.'}
          </DialogDescription>
        </DialogHeader>

        {esCambio ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-2 opacity-60">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Actual
              </p>
              {currentIsNotAttending ? (
                <NotAttendingTile dimmed />
              ) : (
                <MoviePoster
                  src={currentOption?.posterUrl ?? null}
                  alt={currentOption?.title ?? ''}
                  className="rounded-lg border border-border"
                />
              )}
              <p className="text-sm font-medium leading-tight">
                {currentIsNotAttending ? 'No asistire' : currentOption?.title}
              </p>
            </div>

            <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nueva
              </p>
              {eligeNoAsistir ? (
                <NotAttendingTile />
              ) : (
                <MoviePoster
                  src={choice.option.posterUrl}
                  alt={choice.option.title}
                  className="rounded-lg border-2 border-primary"
                />
              )}
              <p className="text-sm font-medium leading-tight">
                {eligeNoAsistir ? 'No asistire' : choice.option.title}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="w-28 shrink-0">
              {eligeNoAsistir ? (
                <NotAttendingTile />
              ) : (
                <MoviePoster
                  src={choice.option.posterUrl}
                  alt={choice.option.title}
                  className="rounded-lg border border-border"
                />
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-lg font-semibold leading-tight text-balance">
                {eligeNoAsistir ? 'No asistire' : choice.option.title}
              </p>
              {!eligeNoAsistir && choice.option.showtime ? (
                <p className="text-sm text-muted-foreground">
                  Proyeccion: {choice.option.showtime}
                </p>
              ) : null}
              {!eligeNoAsistir && (choice.option.genre || choice.option.year) ? (
                <p className="text-sm text-muted-foreground">
                  {[choice.option.genre, choice.option.year].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={loading} onClick={onConfirm}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {esCambio ? 'Cambiar respuesta' : eligeNoAsistir ? 'Confirmar' : 'Confirmar voto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
