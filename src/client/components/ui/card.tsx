import type { HTMLAttributes } from 'react'
import { cn } from '@/client/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-card-header="" className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...props} />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-semibold leading-tight tracking-tight', className)} {...props} />
  )
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

/**
 * Contenido de la tarjeta, con su espacio completo.
 *
 * No lleva `pt-0`: una tarjeta sin cabecera se quedaba sin espacio arriba y
 * el contenido aparecia pegado al borde. El caso "va debajo de una
 * cabecera" se resuelve con una regla de hermano adyacente en index.css.
 */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-card-content="" className={cn('p-5 sm:p-6', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-card-footer=""
      className={cn('flex items-center gap-2 p-5 sm:p-6', className)}
      {...props}
    />
  )
}
