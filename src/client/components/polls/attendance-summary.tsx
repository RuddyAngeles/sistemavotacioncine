import { Clock, Ticket, UserMinus, Users } from 'lucide-react'
import { Card, CardContent } from '@/client/components/ui/card'
import { formatPercentage } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import type { AttendanceDTO } from '@/shared/types'

interface AttendanceSummaryProps {
  attendance: AttendanceDTO
  /** Cambia el titulo cuando la votacion ya esta cerrada. */
  closed?: boolean
  className?: string
}

/**
 * Resumen de asistencia.
 *
 * Responde de un vistazo a la pregunta practica: cuantas entradas hay que
 * comprar. Por eso ese numero va destacado y el resto lo acompana.
 */
export function AttendanceSummary({
  attendance,
  closed = false,
  className,
}: AttendanceSummaryProps) {
  const { attending, notAttending, pending, eligible } = attendance
  const respondidos = attending + notAttending

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-0 sm:p-0">
        <div className="flex flex-col gap-4 border-b border-border bg-surface-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Ticket className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {closed ? 'Entradas a comprar' : 'Entradas si la votacion cerrara ahora'}
              </p>
              <p className="text-3xl font-semibold tabular-nums leading-tight">{attending}</p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-56 sm:text-right">
            {pending > 0
              ? pending + ' personas aun no han respondido; el numero puede subir.'
              : 'Han respondido todos los del censo.'}
          </p>
        </div>

        <dl className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <div className="p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5 text-success" aria-hidden="true" />
              Asisten
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-success">{attending}</dd>
          </div>

          <div className="p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserMinus className="size-3.5" aria-hidden="true" />
              No asisten
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{notAttending}</dd>
          </div>

          <div className="p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-warning" aria-hidden="true" />
              Sin responder
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-warning">{pending}</dd>
          </div>

          <div className="p-4">
            <dt className="text-xs text-muted-foreground">Censo</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{eligible}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {formatPercentage(eligible > 0 ? Math.round((respondidos / eligible) * 1000) / 10 : 0)}{' '}
              ha respondido
            </p>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
