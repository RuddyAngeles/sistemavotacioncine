import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  EyeOff,
  Loader2,
} from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { ErrorState } from '@/client/components/common/states'
import { AppShell } from '@/client/components/layout/app-shell'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card } from '@/client/components/ui/card'
import { SinPermisoParaParticipar } from '@/client/components/surveys/sin-permiso'
import { errorMessage } from '@/client/lib/api'
import { formatDateTime, pluralize } from '@/client/lib/format'
import { mySurveysApi, surveyKeys } from '@/client/lib/queries'

/**
 * Enlace fijo: `/responder`.
 *
 * El equivalente de `/votar` para las encuestas. El administrador lo reparte
 * una sola vez y siempre lleva a la encuesta abierta en ese momento, sin
 * tener que compartir un enlace nuevo cada vez.
 *
 * Quien entre sin sesion acaba en el login y vuelve aqui automaticamente.
 */
export function ActiveSurveyPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: surveyKeys.abiertas,
    queryFn: () => mySurveysApi.abiertas(),
    // El estado cambia cuando el administrador abre o cierra: no conviene
    // servir una respuesta vieja desde la cache.
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Buscando la encuesta abierta…</p>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <AppShell>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </AppShell>
    )
  }

  const pendientes = data.surveys.filter((encuesta) => !encuesta.hasAnswered)

  /*
   * Caso normal: una sola encuesta abierta y sin responder. Se entra directo.
   *
   * Si ya la respondio no se redirige en silencio: veria una pantalla que
   * solo dice "ya respondiste" sin entender por que ha acabado ahi. Se
   * explica antes, abajo.
   */
  if (data.surveys.length === 1 && pendientes.length === 1 && data.canAnswer) {
    const encuesta = data.surveys[0]
    if (encuesta) return <Navigate to={'/app/encuesta/' + encuesta.slug} replace />
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        {data.surveys.length === 0 ? (
          <Vacio />
        ) : (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {data.surveys.length === 1 ? 'Encuesta abierta' : 'Encuestas abiertas'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {data.canAnswer
                  ? 'Elige a cual quieres responder.'
                  : 'Puedes verlas, pero no responderlas todavia.'}
              </p>
            </header>

            {!data.canAnswer ? <SinPermisoParaParticipar /> : null}

            <div className="space-y-3">
              {data.surveys.map((encuesta) => (
                <Card key={encuesta.id} className="transition-colors hover:border-foreground/25">
                  <Link
                    to={'/app/encuesta/' + encuesta.slug}
                    className="flex items-center gap-4 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {encuesta.hasAnswered ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            Respondida
                          </Badge>
                        ) : (
                          <Badge>Pendiente</Badge>
                        )}
                        {encuesta.anonymous ? (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="size-3" aria-hidden="true" />
                            Anonima
                          </Badge>
                        ) : null}
                      </div>

                      <p className="truncate font-medium">{encuesta.title}</p>

                      <p className="text-xs text-muted-foreground">
                        {pluralize(encuesta.questionCount, 'pregunta', 'preguntas')}
                        {encuesta.endsAt ? (
                          <>
                            {' · '}
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="size-3" aria-hidden="true" />
                              Cierra el {formatDateTime(encuesta.endsAt)}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </Card>
              ))}
            </div>
          </>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Guarda este enlace. Siempre te llevara a la encuesta abierta en ese momento, asi que
          sirve tambien para las proximas sin que nadie tenga que avisarte.
        </p>
      </div>
    </AppShell>
  )
}

function Vacio() {
  return (
    <div className="space-y-6 py-10 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ClipboardList className="size-6" aria-hidden="true" />
      </span>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ahora mismo no hay ninguna encuesta abierta
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          Cuando el administrador abra la proxima, este mismo enlace te llevara directo a ella.
        </p>
      </div>

      <Button asChild variant="outline">
        <Link to="/app/encuestas">Ver mis encuestas</Link>
      </Button>
    </div>
  )
}
