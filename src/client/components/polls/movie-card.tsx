import { motion } from 'framer-motion'
import { Check, Clock } from 'lucide-react'
import { MoviePoster } from '@/client/components/polls/movie-poster'
import { Button } from '@/client/components/ui/button'
import { formatDuration } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import type { PollOptionDTO } from '@/shared/types'

interface MovieCardProps {
  option: PollOptionDTO
  selected: boolean
  disabled?: boolean
  index?: number
  actionLabel?: string
  onSelect?: (option: PollOptionDTO) => void
}

/**
 * Tarjeta de pelicula en la pantalla de votacion.
 *
 * Toda la tarjeta es pulsable y ademas hay un boton explicito: en movil la
 * superficie grande es mas comoda, y el boton deja clara la accion. El
 * estado seleccionado se comunica con color, icono y `aria-pressed`, no solo
 * con color.
 */
export function MovieCard({
  option,
  selected,
  disabled = false,
  index = 0,
  actionLabel = 'Elegir pelicula',
  onSelect,
}: MovieCardProps) {
  const duration = formatDuration(option.durationMinutes)
  const meta = [option.genre, option.year ? String(option.year) : null, duration].filter(Boolean)
  const interactive = !disabled && Boolean(onSelect)

  const handleSelect = () => {
    if (interactive) onSelect?.(option)
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3), ease: 'easeOut' }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-soft',
        'transition-[border-color,box-shadow,transform] duration-200',
        selected
          ? 'border-primary ring-2 ring-primary/25'
          : 'border-border hover:border-foreground/25 hover:shadow-raised',
        interactive && 'cursor-pointer',
      )}
      onClick={handleSelect}
    >
      <div className="relative overflow-hidden">
        <MoviePoster
          src={option.posterUrl}
          alt={'Cartel de ' + option.title}
          priority={index < 2}
          className={cn(
            '[&>img]:group-hover:scale-[1.03]',
            selected && '[&>img]:scale-[1.03]',
          )}
        />

        {selected ? (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised"
          >
            <Check className="size-4" aria-hidden="true" />
            <span className="sr-only">Seleccionada</span>
          </motion.div>
        ) : null}

        {option.showtime ? (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Clock className="size-3" aria-hidden="true" />
            {option.showtime}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-semibold leading-tight text-balance">{option.title}</h3>
          {meta.length > 0 ? (
            <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
          ) : null}
        </div>

        {option.description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {option.description}
          </p>
        ) : null}

        {onSelect ? (
          <Button
            type="button"
            variant={selected ? 'default' : 'outline'}
            size="lg"
            className="mt-auto w-full"
            disabled={disabled}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation()
              handleSelect()
            }}
          >
            {selected ? <Check /> : null}
            {selected ? 'Tu eleccion' : actionLabel}
          </Button>
        ) : null}
      </div>
    </motion.article>
  )
}
