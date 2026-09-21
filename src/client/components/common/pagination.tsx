import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/utils'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  /** Nombre de lo que se lista, en plural: "usuarios", "votaciones"… */
  label: string
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Paginacion y recuento de una lista.
 *
 * Siempre muestra cuantos elementos hay en total, incluso cuando caben en
 * una sola pagina: sin ese dato una lista recortada parece completa y el
 * resto de registros desaparece sin avisar.
 */
export function Pagination({
  page,
  pageSize,
  total,
  label,
  onPageChange,
  className,
}: PaginationProps) {
  if (total === 0) return null

  const ultimaPagina = Math.max(1, Math.ceil(total / pageSize))
  const desde = (page - 1) * pageSize + 1
  const hasta = Math.min(page * pageSize, total)
  const hayVariasPaginas = ultimaPagina > 1

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {hayVariasPaginas ? (
          <>
            Mostrando {desde}–{hasta} de {total} {label}
          </>
        ) : (
          <>
            {total} {label}
          </>
        )}
      </p>

      {hayVariasPaginas ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            Anterior
          </Button>

          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {ultimaPagina}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= ultimaPagina}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
