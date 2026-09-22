import { cn } from '@/client/lib/utils'

/**
 * Marca de Quorum: el anillo de participacion.
 *
 * Es el mismo trazado que `public/favicon.svg`, a proposito: la figura de la
 * cabecera y la de la pestana del navegador tienen que ser identicas. Si se
 * cambia una, hay que cambiar la otra.
 *
 * El arco cubre el 89% de la circunferencia con una muesca de 40 grados
 * arriba. Representa lo que mide la aplicacion: que parte del censo ha
 * respondido, que es lo que significa un quorum.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-7 shrink-0', className)}
      role="img"
      aria-label="Quorum"
    >
      <path
        d="M 9.26 4.48 A 8 8 0 1 0 14.74 4.48"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  )
}
