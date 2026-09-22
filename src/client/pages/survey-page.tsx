import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, EyeOff, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppShell } from '@/client/components/layout/app-shell'
import { ErrorState, LoadingState } from '@/client/components/common/states'
import { PageHeader } from '@/client/components/common/page-header'
import { AnswerField, AnswerReadonly } from '@/client/components/surveys/answer-field'
import { SurveyResults } from '@/client/components/surveys/survey-results'
import { SinPermisoParaParticipar } from '@/client/components/surveys/sin-permiso'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { errorMessage } from '@/client/lib/api'
import { mySurveysApi, surveyKeys } from '@/client/lib/queries'
import type { SurveyAnswerInput } from '@/shared/schemas'
import type { SurveyBlockReason } from '@/shared/types'

const MOTIVOS: Record<SurveyBlockReason, string> = {
  NO_PERMISSION: 'No tienes permiso para participar en encuestas. Pideselo al administrador.',
  NOT_OPEN: 'Esta encuesta todavia no esta abierta.',
  NOT_STARTED: 'Esta encuesta aun no ha comenzado.',
  ENDED: 'El plazo para responder ha terminado.',
  CLOSED: 'Esta encuesta esta cerrada.',
  ARCHIVED: 'Esta encuesta esta archivada.',
  ALREADY_ANSWERED: 'Ya has respondido a esta encuesta.',
  USER_INACTIVE: 'Tu cuenta no esta activa.',
}

/**
 * Responder una encuesta.
 *
 * Los permisos vienen ya resueltos del servidor; aqui solo se representan.
 * El envio se valida igualmente en el backend: lo que se comprueba en esta
 * pantalla es para avisar antes, no para decidir.
 */
export function SurveyPage() {
  const { slug = '' } = useParams()
  const queryClient = useQueryClient()
  const [respuestas, setRespuestas] = useState<Map<string, SurveyAnswerInput>>(new Map())
  const [editando, setEditando] = useState(false)

  const consulta = useQuery({
    queryKey: surveyKeys.mineDetail(slug),
    queryFn: () => mySurveysApi.get(slug),
    enabled: slug.length > 0,
  })

  const enviar = useMutation({
    mutationFn: () => mySurveysApi.submit(slug, [...respuestas.values()]),
    onSuccess: async (resultado) => {
      toast.success(resultado.changed ? 'Respuesta actualizada' : 'Respuesta enviada', {
        description: 'Gracias por participar.',
      })
      setEditando(false)
      await queryClient.invalidateQueries({ queryKey: surveyKeys.mineDetail(slug) })
      await queryClient.invalidateQueries({ queryKey: surveyKeys.mine })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido enviar la respuesta')),
  })

  if (consulta.isLoading) {
    return (
      <AppShell>
        <LoadingState label="Cargando encuesta…" />
      </AppShell>
    )
  }

  if (consulta.isError || !consulta.data) {
    return (
      <AppShell>
        <ErrorState message={errorMessage(consulta.error)} onRetry={() => void consulta.refetch()} />
      </AppShell>
    )
  }

  const { survey, questions, permissions, myResponse, hasAnswered, results } = consulta.data
  const previas = new Map((myResponse?.answers ?? []).map((r) => [r.questionId, r]))
  const mostrarFormulario = permissions.canAnswer || (permissions.canChangeAnswer && editando)

  const responder = (respuesta: SurveyAnswerInput) => {
    setRespuestas((actual) => {
      const siguiente = new Map(actual)
      siguiente.set(respuesta.questionId, respuesta)
      return siguiente
    })
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link
            to="/app/encuestas"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Encuestas
          </Link>
        </div>

        <PageHeader title={survey.title} description={survey.description ?? undefined} />

        {survey.anonymous ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex gap-3">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Esta encuesta es anonima</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tus respuestas se guardan sin ninguna relacion contigo: nadie, ni el
                  administrador, puede saber que has contestado. Solo queda registrado que has
                  participado. Por eso mismo, una vez enviada no se podra modificar.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* --- Ya respondida ------------------------------------------- */}
        {hasAnswered && !editando ? (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Respuesta registrada</p>
                  <p className="text-xs text-muted-foreground">
                    {survey.anonymous
                      ? 'Al ser anonima, tu respuesta no se puede consultar ni cambiar.'
                      : permissions.canChangeAnswer
                        ? 'Puedes cambiarla mientras la encuesta siga abierta.'
                        : 'Esta encuesta no permite cambiar la respuesta.'}
                  </p>
                </div>
              </div>

              {permissions.canChangeAnswer ? (
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setRespuestas(new Map(previas))
                    setEditando(true)
                  }}
                >
                  Cambiar respuesta
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* --- Bloqueada ------------------------------------------------ */}
        {!mostrarFormulario && !hasAnswered && permissions.blockReason ? (
          permissions.blockReason === 'NO_PERMISSION' ? (
            // Caso aparte: si es administrador, puede resolverlo aqui mismo.
            <SinPermisoParaParticipar />
          ) : (
            <Card>
              <CardContent className="flex gap-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{MOTIVOS[permissions.blockReason]}</p>
              </CardContent>
            </Card>
          )
        ) : null}

        {/* --- Formulario ----------------------------------------------- */}
        {mostrarFormulario ? (
          <form
            className="space-y-6"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault()
              const sinResponder = questions.find(
                (pregunta) => pregunta.required && !respuestas.has(pregunta.id),
              )
              if (sinResponder) {
                toast.error('Falta responder', { description: sinResponder.text })
                return
              }
              enviar.mutate()
            }}
          >
            {questions.map((pregunta, indice) => (
              <Card key={pregunta.id}>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <p id={'pregunta-' + pregunta.id} className="font-medium">
                      <span className="mr-1.5 text-muted-foreground tabular-nums">
                        {indice + 1}.
                      </span>
                      {pregunta.text}
                      {!pregunta.required ? (
                        <Badge variant="outline" className="ml-2 align-middle">
                          Opcional
                        </Badge>
                      ) : null}
                    </p>
                    {pregunta.help ? (
                      <p className="text-xs text-muted-foreground">{pregunta.help}</p>
                    ) : null}
                  </div>

                  <AnswerField
                    question={pregunta}
                    value={respuestas.get(pregunta.id)}
                    disabled={enviar.isPending}
                    onChange={responder}
                  />
                </CardContent>
              </Card>
            ))}

            <div className="flex justify-end gap-2">
              {editando ? (
                <Button type="button" variant="outline" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" size="lg" disabled={enviar.isPending}>
                {enviar.isPending ? <Loader2 className="animate-spin" /> : null}
                {editando ? 'Guardar cambios' : 'Enviar respuestas'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* --- Mi respuesta (solo en las identificadas) ------------------ */}
        {hasAnswered && !editando && myResponse ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Lo que respondiste</h2>
            {questions.map((pregunta) => (
              <Card key={pregunta.id}>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{pregunta.text}</p>
                  <AnswerReadonly question={pregunta} value={previas.get(pregunta.id)} />
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        {/* --- Resultados ----------------------------------------------- */}
        {results ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Resultados</h2>
            <SurveyResults results={results} />
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
