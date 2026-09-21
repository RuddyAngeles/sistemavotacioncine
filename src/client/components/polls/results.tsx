import { motion } from 'framer-motion'
import { EyeOff, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { formatPercentage, pluralize } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import type { ResultsDTO, ResultsOptionDTO } from '@/shared/types'

/**
 * Barra de un resultado.
 *
 * El porcentaje se anuncia tambien como texto, no solo como longitud de
 * barra: el color y el tamano nunca son el unico canal de informacion.
 */
export function ResultsBar({
  option,
  leading,
  index,
  highlight,
}: {
  option: ResultsOptionDTO
  leading: boolean
  index: number
  highlight?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {leading && option.votes > 0 ? (
            <Trophy className="size-4 shrink-0 text-warning" aria-label="Opcion mas votada" />
          ) : null}
          <span className={cn('truncate text-sm font-medium', highlight && 'text-primary')}>
            {option.title}
          </span>
          {highlight ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Tu voto
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-sm font-semibold tabular-nums">
            {formatPercentage(option.percentage)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
            {pluralize(option.votes, 'voto', 'votos')}
          </span>
        </div>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={option.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={option.title + ': ' + formatPercentage(option.percentage)}
      >
        <motion.div
          className={cn('h-full rounded-full', leading && option.votes > 0 ? 'bg-primary' : 'bg-foreground/35')}
          initial={{ width: 0 }}
          animate={{ width: option.percentage + '%' }}
          transition={{ duration: 0.6, delay: index * 0.05, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

interface ResultsChartProps {
  results: ResultsDTO
  /** Opcion votada por el usuario actual, para resaltarla. */
  myOptionId?: string | null
  title?: string
  description?: string
}

export function ResultsChart({
  results,
  myOptionId = null,
  title = 'Resultados',
  description,
}: ResultsChartProps) {
  const maxVotes = Math.max(0, ...results.options.map((option) => option.votes))

  /*
   * Sin `overview` (un trabajador) no hay censo ni participacion que mostrar:
   * solo el reparto por pelicula. El total que se ensena entonces es la suma
   * de los votos a peliculas, que ya esta a la vista en las barras.
   */
  const votosAPeliculas = results.options.reduce((total, option) => total + option.votes, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {results.overview ? (
              <>
                {pluralize(results.overview.totalVotes, 'voto', 'votos')} ·{' '}
                {formatPercentage(results.overview.participationRate)} de participacion
              </>
            ) : (
              pluralize(votosAPeliculas, 'voto', 'votos')
            )}
          </p>
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>

      <CardContent className="space-y-5">
        {results.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta votacion todavia no tiene peliculas.</p>
        ) : (
          results.options.map((option, index) => (
            <ResultsBar
              key={option.optionId}
              option={option}
              index={index}
              leading={option.votes === maxVotes && maxVotes > 0}
              highlight={option.optionId === myOptionId}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

/** Mensaje mostrado cuando el administrador ha ocultado los resultados. */
export function ResultsHidden({ closed = false }: { closed?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted">
          <EyeOff className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Resultados ocultos</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {closed
              ? 'El administrador ha decidido no publicar los resultados de esta votacion.'
              : 'El administrador ha decidido ocultar los resultados mientras la votacion esta activa.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
