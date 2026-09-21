import type { ReactNode } from 'react'
import { Label } from '@/client/components/ui/label'
import { cn } from '@/client/lib/utils'

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string | undefined
  required?: boolean
  children: ReactNode
  className?: string
}

/**
 * Envoltorio de campo de formulario.
 * Conecta etiqueta, descripcion y mensaje de error mediante `aria-describedby`
 * para que los lectores de pantalla los anuncien junto al control.
 */
export function Field({ id, label, hint, error, required, children, className }: FieldProps) {
  const hintId = hint ? id + '-hint' : undefined
  const errorId = error ? id + '-error' : undefined

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Atributos de accesibilidad que debe recibir el control del campo.
 * El asterisco de la etiqueta es decorativo (lleva `aria-hidden`), asi que
 * la obligatoriedad se comunica al lector de pantalla con `aria-required`.
 */
export function fieldAria(id: string, hasHint: boolean, error?: string, required?: boolean) {
  const describedBy = [hasHint && !error ? id + '-hint' : null, error ? id + '-error' : null]
    .filter(Boolean)
    .join(' ')

  return {
    id,
    'aria-required': required ? true : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
  }
}
