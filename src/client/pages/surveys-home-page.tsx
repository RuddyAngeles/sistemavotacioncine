import { useQuery } from '@tanstack/react-query'
import { CircleCheck, ClipboardList, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/client/components/common/states'
import { PageHeader } from '@/client/components/common/page-header'
import { AppShell } from '@/client/components/layout/app-shell'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { SinPermisoParaParticipar } from '@/client/components/surveys/sin-permiso'
import { Badge } from '@/client/components/ui/badge'
import { Card, CardContent } from '@/client/components/ui/card'
import { useAuth } from '@/client/hooks/use-auth'
import { errorMessage } from '@/client/lib/api'
import { pluralize } from '@/client/lib/format'
import { mySurveysApi, surveyKeys } from '@/client/lib/queries'

/**
 * Encuestas disponibles para quien participa.
 *
 * Si la cuenta no tiene el permiso, se dice claramente en vez de mostrar una
 * lista que no lleva a ninguna parte.
 */
export function SurveysHomePage() {
  const { user } = useAuth()

  const consulta = useQuery({
    queryKey: surveyKeys.mine,
    queryFn: () => mySurveysApi.list(),
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          title="Encuestas"
          description="Responde a las encuestas abiertas del equipo."
        />

        {user && !user.canAnswerSurveys ? <SinPermisoParaParticipar /> : null}

        {consulta.isLoading ? (
          <LoadingState label="Cargando encuestas…" />
        ) : consulta.isError ? (
          <ErrorState
            message={errorMessage(consulta.error)}
            onRetry={() => void consulta.refetch()}
          />
        ) : consulta.data && consulta.data.items.length > 0 ? (
          <div className="space-y-3">
            {consulta.data.items.map(({ survey, hasAnswered, canAnswer }) => (
              <Link
                key={survey.id}
                to={'/app/encuesta/' + survey.slug}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="transition-colors hover:border-foreground/20">
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <PollStatusBadge status={survey.status} />
                        {survey.anonymous ? (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="size-3" aria-hidden="true" />
                            Anonima
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate font-medium">{survey.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(survey.questionCount, 'pregunta', 'preguntas')}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {hasAnswered ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-success">
                          <CircleCheck className="size-4" aria-hidden="true" />
                          Respondida
                        </span>
                      ) : canAnswer ? (
                        <Badge>Pendiente</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No disponible</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No hay encuestas"
            description="Cuando el administrador abra una, aparecera aqui."
          />
        )}
      </div>
    </AppShell>
  )
}
