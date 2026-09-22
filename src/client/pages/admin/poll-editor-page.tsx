import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Film, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/client/components/common/confirm-dialog'
import { EmptyState, ErrorState, LoadingState } from '@/client/components/common/states'
import {
  OptionFormDialog,
  type SubmitIntent,
} from '@/client/components/polls/option-form-dialog'
import { AttendanceSummary } from '@/client/components/polls/attendance-summary'
import { ParticipationPanel } from '@/client/components/polls/participation-panel'
import { PollControls } from '@/client/components/polls/poll-controls'
import { PollForm } from '@/client/components/polls/poll-form'
import { PollStatusBadge } from '@/client/components/polls/poll-status-badge'
import { ResultsChart } from '@/client/components/polls/results'
import { SortableOptions } from '@/client/components/polls/sortable-options'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { errorMessage } from '@/client/lib/api'
import { formatShortDateTime, isoToLocalInput, pluralize } from '@/client/lib/format'
import {
  optionFormToPayload,
  pollFormToPayload,
  type OptionFormValues,
  type PollFormValues,
} from '@/client/lib/form-schemas'
import { pollsApi, queryKeys, type PollTransitionName } from '@/client/lib/queries'
import { areOptionsEditable, isPollEditable } from '@/shared/policy'
import type { PollDetailDTO, PollOptionDTO } from '@/shared/types'

type PendingAction = PollTransitionName | 'duplicate' | 'delete' | null

function toFormValues(poll: PollDetailDTO): PollFormValues {
  return {
    title: poll.title,
    description: poll.description ?? '',
    kind: poll.kind,
    allowVoteChange: poll.allowVoteChange,
    showLiveResults: poll.showLiveResults,
    showResultsAfterClose: poll.showResultsAfterClose,
    allowNotAttending: poll.allowNotAttending,
    startsAt: isoToLocalInput(poll.startsAt),
    endsAt: isoToLocalInput(poll.endsAt),
  }
}

/**
 * Gestion completa de una votacion: configuracion, cartelera, ciclo de vida
 * y resultados con participacion.
 */
export function PollEditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pending, setPending] = useState<PendingAction>(null)
  /** `seq` reinicia el formulario al encadenar varias altas seguidas. */
  const [optionDialog, setOptionDialog] = useState<{
    open: boolean
    option: PollOptionDTO | null
    seq: number
  }>({ open: false, option: null, seq: 0 })
  const [deletingOption, setDeletingOption] = useState<PollOptionDTO | null>(null)
  const [showChoices, setShowChoices] = useState(false)

  const tab = searchParams.get('tab') ?? 'configuracion'

  const pollQuery = useQuery({
    queryKey: queryKeys.poll(id),
    queryFn: () => pollsApi.get(id),
    enabled: id.length > 0,
    staleTime: 10_000,
  })

  const poll = pollQuery.data

  const resultsQuery = useQuery({
    queryKey: queryKeys.pollResults(id),
    queryFn: () => pollsApi.results(id),
    enabled: id.length > 0 && tab === 'resultados',
    // El administrador siempre ve resultados; en vivo mientras este abierta.
    refetchInterval: poll?.status === 'ACTIVE' ? 15_000 : false,
  })

  const participationQuery = useQuery({
    queryKey: queryKeys.pollParticipation(id, showChoices),
    queryFn: () => pollsApi.participation(id, showChoices),
    enabled: id.length > 0 && tab === 'resultados',
    refetchInterval: poll?.status === 'ACTIVE' ? 30_000 : false,
  })

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.poll(id) })
    await queryClient.invalidateQueries({ queryKey: ['polls'] })
    await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
  }

  const updateMutation = useMutation({
    mutationFn: (values: PollFormValues) => pollsApi.update(id, pollFormToPayload(values)),
    onSuccess: async () => {
      toast.success('Cambios guardados')
      await refreshAll()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const transitionMutation = useMutation({
    mutationFn: (transition: PollTransitionName) => pollsApi.transition(id, transition),
    onMutate: (transition) => setPending(transition),
    onSuccess: async (updated) => {
      toast.success('Estado actualizado', { description: 'Ahora esta en ' + updated.status })
      await refreshAll()
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setPending(null),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => pollsApi.duplicate(id),
    onMutate: () => setPending('duplicate'),
    onSuccess: async (created) => {
      toast.success('Votacion duplicada', { description: 'La copia se ha creado como borrador.' })
      await queryClient.invalidateQueries({ queryKey: ['polls'] })
      navigate('/admin/votaciones/' + created.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setPending(null),
  })

  const deleteMutation = useMutation({
    mutationFn: () => pollsApi.remove(id),
    onMutate: () => setPending('delete'),
    onSuccess: async () => {
      toast.success('Votacion eliminada')
      await queryClient.invalidateQueries({ queryKey: ['polls'] })
      navigate('/admin/votaciones')
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setPending(null),
  })

  const optionMutation = useMutation({
    mutationFn: ({ values }: { values: OptionFormValues; intent: SubmitIntent }) => {
      const payload = optionFormToPayload(values)
      return optionDialog.option
        ? pollsApi.updateOption(id, optionDialog.option.id, payload)
        : pollsApi.addOption(id, payload)
    },
    onSuccess: async (_result, { intent }) => {
      toast.success(optionDialog.option ? 'Pelicula actualizada' : 'Pelicula agregada')

      if (intent === 'add-another') {
        // Dejamos el dialogo abierto con el formulario limpio para la siguiente.
        setOptionDialog((current) => ({ open: true, option: null, seq: current.seq + 1 }))
      } else {
        setOptionDialog((current) => ({ ...current, open: false, option: null }))
      }

      await refreshAll()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deleteOptionMutation = useMutation({
    mutationFn: (optionId: string) => pollsApi.removeOption(id, optionId),
    onSuccess: async () => {
      toast.success('Pelicula eliminada')
      setDeletingOption(null)
      await refreshAll()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const reorderMutation = useMutation({
    mutationFn: (optionIds: string[]) => pollsApi.reorderOptions(id, optionIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.poll(id) })
    },
    onError: async (error) => {
      toast.error(errorMessage(error, 'No se ha podido guardar el orden'))
      await queryClient.invalidateQueries({ queryKey: queryKeys.poll(id) })
    },
  })

  if (pollQuery.isLoading) return <LoadingState label="Cargando votacion…" />

  if (pollQuery.isError || !poll) {
    return (
      <ErrorState
        title="No se ha podido cargar la votacion"
        message={errorMessage(pollQuery.error, 'Es posible que ya no exista')}
        onRetry={() => void pollQuery.refetch()}
      />
    )
  }

  const editable = isPollEditable(poll.status)
  const optionsEditable = areOptionsEditable(poll.status)

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/admin/votaciones"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Votaciones
        </Link>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <PollStatusBadge status={poll.status} />
          <span className="font-mono text-xs text-muted-foreground">/{poll.slug}</span>
          {poll.openedAt ? (
            <span className="text-xs text-muted-foreground">
              Abierta el {formatShortDateTime(poll.openedAt)}
            </span>
          ) : null}
          {poll.closedAt ? (
            <span className="text-xs text-muted-foreground">
              Cerrada el {formatShortDateTime(poll.closedAt)}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {poll.title}
        </h1>

        <PollControls
          poll={poll}
          pending={pending}
          onTransition={(transition) => transitionMutation.mutate(transition)}
          onDuplicate={() => duplicateMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
        />
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="configuracion">Configuracion</TabsTrigger>
          <TabsTrigger value="cartelera">
            Cartelera
            <span className="ml-1 text-xs text-muted-foreground tabular-nums">
              {poll.optionCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------------- */}
        <TabsContent value="configuracion">
          {!editable ? (
            <Card className="mb-6 border-warning/30 bg-warning/5">
              <CardContent className="flex gap-3 p-4">
                <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  La votacion esta cerrada o archivada: su configuracion ya no se puede modificar
                  para no alterar un resultado publicado.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <PollForm
            key={poll.updatedAt}
            defaultValues={toFormValues(poll)}
            disabled={!editable}
            submitting={updateMutation.isPending}
            submitLabel="Guardar cambios"
            onSubmit={(values) => updateMutation.mutate(values)}
          />
        </TabsContent>

        {/* --------------------------------------------------------------- */}
        <TabsContent value="cartelera" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Peliculas</h2>
              <p className="text-sm text-muted-foreground">
                {pluralize(poll.options.length, 'pelicula', 'peliculas')} · el orden se guarda al
                soltar
              </p>
            </div>

            <Button
              disabled={!optionsEditable}
              onClick={() => setOptionDialog((current) => ({ open: true, option: null, seq: current.seq + 1 }))}
            >
              <Plus />
              Agregar pelicula
            </Button>
          </div>

          {!optionsEditable ? (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="flex gap-3 p-4">
                <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  La cartelera se bloquea en cuanto la votacion se abre: cambiarla con votos ya
                  emitidos invalidaria el resultado.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {poll.options.length === 0 ? (
            <EmptyState
              icon={Film}
              title="La cartelera esta vacia"
              description="Agrega aqui cada pelicula con su imagen. Es lo que veran los trabajadores al votar: una tarjeta por pelicula, con su cartelera."
              action={
                <Button
                  disabled={!optionsEditable}
                  onClick={() => setOptionDialog((current) => ({ open: true, option: null, seq: current.seq + 1 }))}
                >
                  <Plus />
                  Agregar pelicula
                </Button>
              }
            />
          ) : (
            <SortableOptions
              options={poll.options}
              disabled={!optionsEditable || reorderMutation.isPending}
              onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
              onEdit={(option) => setOptionDialog((current) => ({ ...current, open: true, option }))}
              onDelete={setDeletingOption}
            />
          )}
        </TabsContent>

        {/* --------------------------------------------------------------- */}
        <TabsContent value="resultados" className="space-y-6">
          {resultsQuery.isLoading ? (
            <LoadingState label="Calculando resultados…" />
          ) : resultsQuery.isError ? (
            <ErrorState
              message={errorMessage(resultsQuery.error)}
              onRetry={() => void resultsQuery.refetch()}
            />
          ) : resultsQuery.data ? (
            <>
              {resultsQuery.data.results.overview ? (
                <AttendanceSummary
                  attendance={resultsQuery.data.results.overview.attendance}
                  closed={poll.status === 'CLOSED' || poll.status === 'ARCHIVED'}
                />
              ) : null}

              <ResultsChart
                results={resultsQuery.data.results}
                title={poll.status === 'ACTIVE' ? 'Resultados en vivo' : 'Resultado final'}
                description={
                  poll.showLiveResults
                    ? 'Los trabajadores ven este reparto por pelicula, pero no el resumen de asistencia ni quien ha votado.'
                    : 'Los trabajadores no ven estos resultados mientras la votacion esta abierta.'
                }
              />
            </>
          ) : null}

          {participationQuery.data ? (
            <ParticipationPanel
              participation={participationQuery.data.participation}
              showChoices={showChoices}
              loadingChoices={participationQuery.isFetching}
              onToggleChoices={setShowChoices}
            />
          ) : participationQuery.isLoading ? (
            <LoadingState label="Cargando participacion…" />
          ) : null}
        </TabsContent>
      </Tabs>

      <OptionFormDialog
        open={optionDialog.open}
        onOpenChange={(open) =>
          setOptionDialog((current) => ({ ...current, open, option: open ? current.option : null }))
        }
        option={optionDialog.option}
        submitting={optionMutation.isPending}
        formKey={optionDialog.seq}
        onSubmit={(values, intent) => optionMutation.mutate({ values, intent })}
      />

      <ConfirmDialog
        open={deletingOption !== null}
        onOpenChange={(open) => !open && setDeletingOption(null)}
        title="Eliminar pelicula?"
        description={
          <>
            Se quitara <strong>{deletingOption?.title}</strong> de la cartelera.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleteOptionMutation.isPending}
        onConfirm={() => {
          if (deletingOption) deleteOptionMutation.mutate(deletingOption.id)
        }}
      />
    </div>
  )
}
