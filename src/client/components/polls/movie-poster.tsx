import { Film } from 'lucide-react'
import { cn } from '@/client/lib/utils'

interface MoviePosterProps {
  src: string | null
  alt: string
  className?: string
  /** Relacion de aspecto tipica de cartel de cine. */
  ratio?: '2/3' | '16/9' | '1/1'
  priority?: boolean
}

/**
 * Cartelera de la pelicula.
 *
 * Las imagenes se sirven desde el Worker (bucket R2 privado) y se cargan de
 * forma diferida salvo las primeras de la pantalla.
 */
export function MoviePoster({
  src,
  alt,
  className,
  ratio = '2/3',
  priority = false,
}: MoviePosterProps) {
  const aspect = ratio === '2/3' ? 'aspect-[2/3]' : ratio === '16/9' ? 'aspect-video' : 'aspect-square'

  return (
    <div className={cn('relative overflow-hidden bg-muted', aspect, className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className="size-full object-cover transition-transform duration-500 ease-out"
        />
      ) : (
        <div
          className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"
          aria-hidden="true"
        >
          <Film className="size-7" />
          <span className="px-3 text-center text-xs">Sin cartelera</span>
        </div>
      )}
    </div>
  )
}
