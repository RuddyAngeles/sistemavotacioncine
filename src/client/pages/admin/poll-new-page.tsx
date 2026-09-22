import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Image as ImageIcon, ListChecks } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/client/components/common/page-header'
import { PollForm } from '@/client/components/polls/poll-form'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { errorMessage } from '@/client/lib/api'
import { emptyPollForm, pollFormToPayload, type PollFormValues } from '@/client/lib/form-schemas'
import { pollsApi, queryKeys } from '@/client/lib/queries'

/**
 * Creacion de una votacion.
 *
 * Siempre nace como borrador: publicar y abrir son pasos posteriores y
 * explicitos, para poder prepararlo todo con antelacion.
 */
export function PollNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (values: PollFormValues) => pollsApi.create(pollFormToPayload(values)),
    onSuccess: async (poll) => {
      toast.success('Borrador creado', { description: 'Ahora agrega las peliculas.' })
      await queryClient.invalidateQueries({ queryKey: ['polls'] })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      navigate('/admin/votaciones/' + poll.id + '?tab=cartelera', { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido crear la votacion')),
  })

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

      <PageHeader
        title="Nueva votacion"
        description="Define el titulo, las reglas y, si quieres, la programacion. Podras cambiarlo todo mientras siga en borrador."
      />

      {/*
        Crear la votacion y montar la cartelera son dos pasos distintos, y eso
        no se deducia de la pantalla: aqui no hay ningun sitio donde subir una
        imagen, porque las carteleras van por pelicula. Se explica antes de
        que el usuario las busque.
      */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ol className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <li className="flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
                Datos y reglas
                <span className="text-xs font-normal text-muted-foreground">(esta pantalla)</span>
              </span>
            </li>

            <ArrowRight
              className="hidden size-4 shrink-0 text-muted-foreground sm:block"
              aria-hidden="true"
            />

            <li className="flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground">
                2
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <ImageIcon className="size-4" aria-hidden="true" />
                Peliculas y carteleras
              </span>
            </li>
          </ol>

          <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-xs">
            Las imagenes se suben en el paso 2, una por pelicula. Al guardar iras
            directamente alli.
          </p>
        </CardContent>
      </Card>

      <PollForm
        defaultValues={emptyPollForm}
        submitting={mutation.isPending}
        submitLabel="Continuar: agregar peliculas"
        requireDirty={false}
        secondaryAction={
          <Button asChild variant="outline" type="button">
            <Link to="/admin/votaciones">Cancelar</Link>
          </Button>
        }
        onSubmit={(values) => mutation.mutate(values)}
      />
    </div>
  )
}
