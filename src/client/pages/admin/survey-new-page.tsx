import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Field } from '@/client/components/common/field'
import { PageHeader } from '@/client/components/common/page-header'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Textarea } from '@/client/components/ui/textarea'
import {
  SurveySettingsForm,
  type SurveySettingsValues,
} from '@/client/components/surveys/survey-settings'
import { errorMessage } from '@/client/lib/api'
import { surveyKeys, surveysApi } from '@/client/lib/queries'

/**
 * Creacion de una encuesta.
 *
 * Nace como borrador, igual que las votaciones: primero los datos y las
 * reglas, despues las preguntas, y publicar y abrir son pasos explicitos.
 */
export function SurveyNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ajustes, setAjustes] = useState<SurveySettingsValues>({
    anonymous: false,
    allowResponseChange: true,
    showLiveResults: false,
    showResultsAfterClose: true,
  })

  const crear = useMutation({
    mutationFn: () =>
      surveysApi.create({
        title,
        description: description || null,
        ...ajustes,
      }),
    onSuccess: async (encuesta) => {
      toast.success('Borrador creado', { description: 'Ahora anade las preguntas.' })
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all })
      navigate('/admin/encuestas/' + encuesta.id, { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido crear la encuesta')),
  })

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
        title="Nueva encuesta"
        description="Define el titulo y las reglas. Las preguntas se anaden despues, en el siguiente paso."
      />

      <form
        className="space-y-6"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          if (title.trim().length < 3) {
            toast.error('El titulo es obligatorio')
            return
          }
          crear.mutate()
        }}
      >
        <Card>
          <CardContent className="space-y-5">
            <Field id="title" label="Titulo" required>
              <Input
                id="title"
                value={title}
                maxLength={150}
                placeholder="Clima laboral 2026"
                onChange={(evento) => setTitle(evento.target.value)}
              />
            </Field>

            <Field id="description" label="Descripcion" hint="Opcional. Se muestra al empezar.">
              <Textarea
                id="description"
                rows={3}
                maxLength={1000}
                value={description}
                onChange={(evento) => setDescription(evento.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <SurveySettingsForm values={ajustes} onChange={setAjustes} />

        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="outline">
            <Link to="/admin/encuestas">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={crear.isPending}>
            {crear.isPending ? <Loader2 className="animate-spin" /> : null}
            Continuar: anadir preguntas
          </Button>
        </div>
      </form>
    </div>
  )
}
