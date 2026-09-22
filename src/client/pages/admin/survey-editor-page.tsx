import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CircleCheck,
  Clock,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Loader2,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/client/components/common/confirm-dialog'
import { PageHeader } from '@/client/components/common/page-header'
import { ErrorState, LoadingState } from '@/client/components/common/states'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { QuestionDialog, ETIQUETAS_TIPO, type QuestionDraft } from '@/client/components/surveys/question-dialog'
import { SurveyResults } from '@/client/components/surveys/survey-results'
import {
  SurveySettingsForm,
  type SurveySettingsValues,
} from '@/client/components/surveys/survey-settings'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { errorMessage } from '@/client/lib/api'
import { formatDateTime, formatPercentage, pluralize } from '@/client/lib/format'
import { surveyKeys, surveysApi } from '@/client/lib/queries'
import { areQuestionsEditable, isAnonymityEditable, isPollEditable } from '@/shared/policy'
import type { SurveyQuestionDTO } from '@/shared/types'

/**
 * Editor de una encuesta: preguntas, estado, resultados y participacion.
 *
 * Las preguntas se bloquean cuando la encuesta se abre, igual que la cartelera
 * de una votacion: cambiarlas con respuestas ya recibidas dejaria gente
 * contestando a una pregunta distinta de la que se cuenta.
 */
export function SurveyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [editando, setEditando] = useState<SurveyQuestionDTO | null>(null)
  const [aBorrar, setABorrar] = useState<SurveyQuestionDTO | null>(null)

  /*
   * Cuando un cambio descartaria respuestas ya recibidas, el servidor lo
   * rechaza con un 409 y dice cuantas. Se guarda aqui para preguntarlo, en
   * lugar de mostrar un error que no deja hacer nada.
   */
  const [aConfirmar, setAConfirmar] = useState<
    { mensaje: string; reintentar: () => void } | null
  >(null)

  /*
   * Los ajustes se editan en local y se guardan a mano. Aplicarlos al vuelo
   * cambiaria lo que ve la plantilla con cada clic, y estas opciones deciden
   * que se comparte: conviene poder pensarlo antes de confirmar.
   */
  const [ajustes, setAjustes] = useState<SurveySettingsValues | null>(null)
  const [borrandoEncuesta, setBorrandoEncuesta] = useState(false)

  const consulta = useQuery({
    queryKey: surveyKeys.detail(id),
    queryFn: () => surveysApi.get(id),
    enabled: id.length > 0,
  })

  const encuesta = consulta.data

  const resultados = useQuery({
    queryKey: surveyKeys.results(id),
    queryFn: () => surveysApi.results(id),
    enabled: id.length > 0 && (encuesta?.responseCount ?? 0) >= 0,
    refetchInterval: encuesta?.status === 'ACTIVE' ? 15_000 : false,
  })

  const participacion = useQuery({
    queryKey: surveyKeys.participation(id),
    queryFn: () => surveysApi.participation(id),
    enabled: id.length > 0,
  })

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: surveyKeys.detail(id) })
    await queryClient.invalidateQueries({ queryKey: surveyKeys.results(id) })
    await queryClient.invalidateQueries({ queryKey: surveyKeys.participation(id) })
    await queryClient.invalidateQueries({ queryKey: surveyKeys.all })
  }

  const guardarPregunta = useMutation({
    mutationFn: ({ borrador, descartar }: { borrador: QuestionDraft; descartar: boolean }) =>
      editando
        ? surveysApi.updateQuestion(id, editando.id, borrador, descartar)
        : surveysApi.addQuestion(id, borrador),
    onSuccess: async () => {
      toast.success(editando ? 'Pregunta actualizada' : 'Pregunta anadida')
      setDialogoAbierto(false)
      setEditando(null)
      setAConfirmar(null)
      await refrescar()
    },
    onError: (error, variables) => {
      const mensaje = errorMessage(error, 'No se ha podido guardar la pregunta')
      if (mensaje.includes('se descartarian')) {
        setAConfirmar({
          mensaje,
          reintentar: () => guardarPregunta.mutate({ borrador: variables.borrador, descartar: true }),
        })
        return
      }
      toast.error(mensaje)
    },
  })

  const borrarPregunta = useMutation({
    mutationFn: ({ pregunta, descartar }: { pregunta: SurveyQuestionDTO; descartar: boolean }) =>
      surveysApi.removeQuestion(id, pregunta.id, descartar),
    onSuccess: async () => {
      toast.success('Pregunta eliminada')
      setABorrar(null)
      setAConfirmar(null)
      await refrescar()
    },
    onError: (error, variables) => {
      const mensaje = errorMessage(error, 'No se ha podido eliminar')
      if (mensaje.includes('se descartarian')) {
        setAConfirmar({
          mensaje,
          reintentar: () => borrarPregunta.mutate({ pregunta: variables.pregunta, descartar: true }),
        })
        return
      }
      toast.error(mensaje)
    },
  })

  const guardarAjustes = useMutation({
    mutationFn: (valores: SurveySettingsValues) => surveysApi.update(id, valores),
    onSuccess: async () => {
      toast.success('Configuracion guardada', {
        description: 'Ya esta aplicada para quien participe.',
      })
      setAjustes(null)
      await refrescar()
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido guardar')),
  })

  const borrarEncuesta = useMutation({
    mutationFn: (descartar: boolean) => surveysApi.remove(id, descartar),
    onSuccess: async () => {
      toast.success('Encuesta eliminada')
      setBorrandoEncuesta(false)
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all })
      navigate('/admin/encuestas', { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido eliminar')),
  })

  const transicion = useMutation({
    mutationFn: (accion: 'publish' | 'open' | 'close' | 'archive' | 'reopen') =>
      surveysApi.transition(id, accion),
    onSuccess: async () => {
      toast.success('Estado actualizado')
      await refrescar()
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido cambiar el estado')),
  })

  if (consulta.isLoading) return <LoadingState label="Cargando encuesta…" />
  if (consulta.isError || !encuesta) {
    return (
      <ErrorState message={errorMessage(consulta.error)} onRetry={() => void consulta.refetch()} />
    )
  }

  const preguntasEditables = areQuestionsEditable(encuesta.status)

  const guardados: SurveySettingsValues = {
    anonymous: encuesta.anonymous,
    allowResponseChange: encuesta.allowResponseChange,
    showLiveResults: encuesta.showLiveResults,
    showResultsAfterClose: encuesta.showResultsAfterClose,
  }
  const actuales = ajustes ?? guardados
  const hayCambios = (Object.keys(guardados) as Array<keyof SurveySettingsValues>).some(
    (clave) => guardados[clave] !== actuales[clave],
  )

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/admin/encuestas"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Encuestas
        </Link>
      </div>

      <PageHeader
        title={encuesta.title}
        description={encuesta.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {encuesta.status === 'DRAFT' ? (
              <Button
                disabled={transicion.isPending || encuesta.questionCount === 0}
                onClick={() => transicion.mutate('publish')}
              >
                Publicar
              </Button>
            ) : null}
            {(encuesta.status === 'PUBLISHED' || encuesta.status === 'CLOSED') ? (
              <Button disabled={transicion.isPending} onClick={() => transicion.mutate('open')}>
                Abrir
              </Button>
            ) : null}
            {encuesta.status === 'ACTIVE' ? (
              <Button
                variant="outline"
                disabled={transicion.isPending}
                onClick={() => transicion.mutate('close')}
              >
                Cerrar
              </Button>
            ) : null}
            {encuesta.status === 'CLOSED' ? (
              <Button
                variant="outline"
                disabled={transicion.isPending}
                onClick={() => transicion.mutate('archive')}
              >
                Archivar
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar la encuesta"
              title="Eliminar la encuesta"
              onClick={() => setBorrandoEncuesta(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PollStatusBadge status={encuesta.status} />
        {encuesta.anonymous ? (
          <Badge variant="secondary" className="gap-1">
            <EyeOff className="size-3" aria-hidden="true" />
            Anonima
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {pluralize(encuesta.questionCount, 'pregunta', 'preguntas')} ·{' '}
          {pluralize(encuesta.responseCount ?? 0, 'respuesta', 'respuestas')}
        </span>
      </div>

      {/*
        El permiso nace apagado, asi que una encuesta abierta puede no tener a
        nadie que pueda responderla. Se dice aqui, no se deja descubrir.
      */}
      {encuesta.eligibleCount === 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <UserCheck className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Nadie puede responder todavia</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ninguna cuenta tiene el permiso de participar en encuestas. Actívalo antes de
                  abrirla o la gente vera la encuesta sin poder contestar.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/admin/usuarios">Ir a Usuarios</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          {pluralize(encuesta.eligibleCount, 'cuenta puede', 'cuentas pueden')} participar.
        </p>
      )}

      <Tabs defaultValue="preguntas" className="space-y-6">
        <TabsList>
          <TabsTrigger value="preguntas">Preguntas</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
          <TabsTrigger value="participacion">Participacion</TabsTrigger>
          <TabsTrigger value="configuracion">Configuracion</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="preguntas" className="space-y-4">
          {!preguntasEditables ? (
            <Card className="border-info/30 bg-info/5">
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                La encuesta esta cerrada y sus resultados ya se han dado por buenos, asi que las
                preguntas no se pueden cambiar. Si necesitas corregir algo, reabrela.
              </CardContent>
            </Card>
          ) : (encuesta.responseCount ?? 0) > 0 ? (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                Ya hay {pluralize(encuesta.responseCount ?? 0, 'respuesta', 'respuestas')}. Puedes
                corregir el enunciado de una pregunta o el texto de sus opciones sin perder nada.
                Lo que si descarta respuestas es <strong>quitar</strong> una opcion o una pregunta
                que alguien ya contesto, y eso te lo preguntara antes de hacerlo.
              </CardContent>
            </Card>
          ) : null}

          {encuesta.questions.map((pregunta, indice) => (
            <Card key={pregunta.id}>
              <CardContent className="flex items-start gap-3">
                <GripVertical
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground tabular-nums">{indice + 1}.</span>
                    <Badge variant="secondary">{ETIQUETAS_TIPO[pregunta.type]}</Badge>
                    {!pregunta.required ? <Badge variant="outline">Opcional</Badge> : null}
                  </div>

                  <p className="font-medium">{pregunta.text}</p>
                  {pregunta.help ? (
                    <p className="text-xs text-muted-foreground">{pregunta.help}</p>
                  ) : null}

                  {pregunta.options.length > 0 ? (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {pregunta.options.map((opcion) => (
                        <li key={opcion.id}>· {opcion.text}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {preguntasEditables ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={'Editar pregunta ' + (indice + 1)}
                      onClick={() => {
                        setEditando(pregunta)
                        setDialogoAbierto(true)
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={'Eliminar pregunta ' + (indice + 1)}
                      onClick={() => setABorrar(pregunta)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {preguntasEditables ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditando(null)
                setDialogoAbierto(true)
              }}
            >
              <Plus className="size-4" />
              Anadir pregunta
            </Button>
          ) : null}

          {encuesta.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavia no hay preguntas. Anade la primera para poder publicar.
            </p>
          ) : null}
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="resultados">
          {resultados.isLoading ? (
            <LoadingState label="Calculando resultados…" />
          ) : resultados.data ? (
            <SurveyResults results={resultados.data.results} />
          ) : (
            <ErrorState
              message={errorMessage(resultados.error)}
              onRetry={() => void resultados.refetch()}
            />
          )}
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="participacion" className="space-y-4">
          {participacion.data ? (
            <>
              {encuesta.anonymous ? (
                <Card className="border-info/30 bg-info/5">
                  <CardContent className="text-xs leading-relaxed text-muted-foreground">
                    Esta encuesta es anonima: aqui ves <strong>quien ha participado</strong>, que es
                    lo que necesitas para recordarselo a quien falte, pero no que ha respondido
                    cada uno. Esa relacion no se guarda en ningun sitio.
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardContent className="flex flex-wrap gap-6">
                  <Dato etiqueta="Han respondido" valor={participacion.data.participation.answered} />
                  <Dato etiqueta="Faltan" valor={participacion.data.participation.pending} />
                  <Dato etiqueta="Pueden participar" valor={participacion.data.participation.eligible} />
                  <Dato
                    etiqueta="Participacion"
                    valor={formatPercentage(participacion.data.participation.participationRate)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0 sm:p-0">
                  <ul className="divide-y divide-border">
                    {participacion.data.participation.users.map((persona) => (
                      <li key={persona.userId} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{persona.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {persona.username}
                          </p>
                        </div>

                        {persona.hasAnswered ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-success">
                            <CircleCheck className="size-4" aria-hidden="true" />
                            {persona.answeredAt ? formatDateTime(persona.answeredAt) : 'Respondida'}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-4" aria-hidden="true" />
                            Sin responder
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <LoadingState label="Cargando participacion…" />
          )}
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="configuracion" className="space-y-6">
          {!isPollEditable(encuesta.status) ? (
            <Card className="border-info/30 bg-info/5">
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                La encuesta esta cerrada, asi que su configuracion ya no se puede cambiar.
              </CardContent>
            </Card>
          ) : null}

          <SurveySettingsForm
            values={actuales}
            anonymityLocked={!isAnonymityEditable(encuesta.status)}
            disabled={!isPollEditable(encuesta.status) || guardarAjustes.isPending}
            onChange={setAjustes}
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hayCambios || guardarAjustes.isPending}
              onClick={() => setAjustes(null)}
            >
              Descartar
            </Button>
            <Button
              type="button"
              disabled={!hayCambios || guardarAjustes.isPending}
              onClick={() => guardarAjustes.mutate(actuales)}
            >
              {guardarAjustes.isPending ? <Loader2 className="animate-spin" /> : null}
              Guardar configuracion
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={borrandoEncuesta}
        title="Eliminar la encuesta"
        description={
          (encuesta.responseCount ?? 0) > 0 ? (
            <>
              <strong>{encuesta.title}</strong> tiene{' '}
              {pluralize(encuesta.responseCount ?? 0, 'respuesta', 'respuestas')}. Al eliminarla
              se borran tambien, y no se pueden recuperar. Si lo que quieres es dejar de usarla
              pero conservar los resultados, <strong>cierrala y archivala</strong> en lugar de
              borrarla.
            </>
          ) : (
            <>
              Se eliminara <strong>{encuesta.title}</strong> con sus preguntas. Todavia no tiene
              ninguna respuesta, asi que no se pierde nada mas.
            </>
          )
        }
        confirmLabel={
          (encuesta.responseCount ?? 0) > 0 ? 'Eliminarla con sus respuestas' : 'Eliminar'
        }
        variant="destructive"
        loading={borrarEncuesta.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) setBorrandoEncuesta(false)
        }}
        onConfirm={() => borrarEncuesta.mutate((encuesta.responseCount ?? 0) > 0)}
      />

      <QuestionDialog
        open={dialogoAbierto}
        question={editando}
        saving={guardarPregunta.isPending}
        onOpenChange={(abierto) => {
          setDialogoAbierto(abierto)
          if (!abierto) setEditando(null)
        }}
        onSubmit={(borrador) => guardarPregunta.mutate({ borrador, descartar: false })}
      />

      <ConfirmDialog
        open={aConfirmar !== null}
        title="Esto descartara respuestas"
        description={
          <>
            {aConfirmar?.mensaje}. Las respuestas afectadas se perderan y no se pueden recuperar.
            El resto de la encuesta no cambia.
          </>
        }
        confirmLabel="Descartarlas y guardar"
        variant="destructive"
        onOpenChange={(abierto) => {
          if (!abierto) setAConfirmar(null)
        }}
        onConfirm={() => aConfirmar?.reintentar()}
      />

      <ConfirmDialog
        open={aBorrar !== null}
        title="Eliminar la pregunta"
        description={'Se eliminara "' + (aBorrar?.text ?? '') + '" y sus opciones.'}
        confirmLabel="Eliminar"
        variant="destructive"
        onOpenChange={(abierto) => {
          if (!abierto) setABorrar(null)
        }}
        onConfirm={() => {
          if (aBorrar) borrarPregunta.mutate({ pregunta: aBorrar, descartar: false })
        }}
      />
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number | string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  )
}
