import { Check, UserMinus } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { cn } from '@/client/lib/utils'

interface NotAttendingCardProps {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}

/**
 * Respuesta "no podre ir".
 *
 * Va aparte de la cartelera a proposito: no es una pelicula mas. Si fuese
 * una tarjeta del mismo grid competiria visualmente con las opciones reales
 * y falsearia la lectura del resultado.
 */
export function NotAttendingCard({ selected, disabled = false, onSelect }: NotAttendingCardProps) {
  return (
    <Card
      className={cn(
        'transition-[border-color,box-shadow] duration-200',
        selected ? 'border-primary ring-2 ring-primary/25' : 'border-dashed',
      )}
    >
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {selected ? (
              <Check className="size-5" aria-hidden="true" />
            ) : (
              <UserMinus className="size-5" aria-hidden="true" />
            )}
          </span>

          <div className="space-y-0.5">
            <p className="font-medium leading-tight">
              {selected ? 'Has indicado que no iras' : 'No podre ir'}
            </p>
            <p className="text-sm text-muted-foreground">
              Tu respuesta cuenta para el recuento de asistencia, pero no vota a ninguna pelicula.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={selected ? 'default' : 'outline'}
          size="lg"
          className="shrink-0 sm:w-auto"
          disabled={disabled}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? 'Es tu respuesta' : 'No podre ir'}
        </Button>
      </CardContent>
    </Card>
  )
}
