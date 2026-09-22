import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, EyeOff, Pin, Plus, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CopyField } from '@/client/components/common/copy-field'
import { PageHeader } from '@/client/components/common/page-header'
import { Pagination } from '@/client/components/common/pagination'
import { EmptyState, ErrorState, LoadingState } from '@/client/components/common/states'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { useState } from 'react'
import { errorMessage } from '@/client/lib/api'
import { formatDateTime, pluralize } from '@/client/lib/format'
import { surveyKeys, surveysApi } from '@/client/lib/queries'

/**
 * Lista de encuestas.
 *
 * Ademas de la lista, aqui se resuelve el problema practico del modulo: el
 * permiso para participar nace apagado, asi que una encuesta recien abierta
 * no la puede responder nadie. Se avisa arriba con la accion para arreglarlo.
 */
export function SurveysPage() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: [...surveyKeys.all, page],
    queryFn: () => surveysApi.list({ page, pageSize: 20 }),
  })

  const permiso = useMutation({
    mutationFn: () => surveysApi.setPermission(true),
    onSuccess: async (resultado) => {
      toast.success(
        resultado.updated === 0
          ? 'Todas las cuentas activas ya podian participar'
          : pluralize(resultado.updated, 'cuenta activada', 'cuentas activadas'),
        { description: 'Ya pueden responder a las encuestas.' },
      )
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido activar el permiso')),
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Encuestas"
        description="Varias preguntas por encuesta, con la opcion de que sea anonima."
        actions={
          <Button asChild>
            <Link to="/admin/encuestas/nueva">
              <Plus className="size-4" />
              Nueva encuesta
            </Link>
          </Button>
        }
      />

      {/*
        El enlace fijo va aqui ademas de en el panel: esta es la pantalla a
        la que se viene cuando uno quiere repartir una encuesta.
      */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              <Pin className="size-4 text-primary" aria-hidden="true" />
              Enlace para los trabajadores
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Repartelo una vez: siempre lleva a la encuesta abierta en ese momento.
            </p>
          </div>

          <CopyField
            id="enlace-encuestas"
            value={window.location.origin + '/responder'}
            highlighted
            className="w-full sm:max-w-md"
          />
        </div>
      </Card>

      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <UserCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Quien puede participar</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Participar en encuestas es un permiso aparte del rol y nace desactivado. Puedes
                darlo cuenta por cuenta en Usuarios, o a toda la plantilla de una vez.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="shrink-0"
            disabled={permiso.isPending}
            onClick={() => permiso.mutate()}
          >
            Activar a todos
          </Button>
        </CardContent>
      </Card>

      {consulta.isLoading ? (
        <LoadingState label="Cargando encuestas…" />
      ) : consulta.isError ? (
        <ErrorState
          message={errorMessage(consulta.error)}
          onRetry={() => void consulta.refetch()}
        />
      ) : consulta.data && consulta.data.items.length > 0 ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {consulta.data.items.map((encuesta) => (
              <Link
                key={encuesta.id}
                to={'/admin/encuestas/' + encuesta.id}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="transition-colors hover:border-foreground/20">
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <PollStatusBadge status={encuesta.status} />
                        {encuesta.anonymous ? (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="size-3" aria-hidden="true" />
                            Anonima
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate font-medium">{encuesta.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(encuesta.questionCount, 'pregunta', 'preguntas')} ·{' '}
                        {formatDateTime(encuesta.createdAt)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {encuesta.responseCount ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(encuesta.responseCount ?? 0, 'respuesta', 'respuestas')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Pagination
            page={consulta.data.page}
            pageSize={consulta.data.pageSize}
            total={consulta.data.total}
            label="encuestas"
            onPageChange={setPage}
          />
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Todavia no hay encuestas"
          description="Crea la primera para preguntar lo que necesites al equipo."
          action={
            <Button asChild>
              <Link to="/admin/encuestas/nueva">
                <Plus className="size-4" />
                Nueva encuesta
              </Link>
            </Button>
          }
        />
      )}
    </div>
  )
}
