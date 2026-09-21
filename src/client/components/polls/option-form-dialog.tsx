import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Field, fieldAria } from '@/client/components/common/field'
import { ImageUploader } from '@/client/components/polls/image-uploader'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Textarea } from '@/client/components/ui/textarea'
import { emptyOptionForm, optionFormSchema, type OptionFormValues } from '@/client/lib/form-schemas'
import type { PollOptionDTO } from '@/shared/types'

/** Que hacer despues de guardar: cerrar, o dejar listo el siguiente alta. */
export type SubmitIntent = 'close' | 'add-another'

interface OptionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se pasa, el dialogo edita en lugar de crear. */
  option?: PollOptionDTO | null
  submitting?: boolean
  /**
   * Cambia entre altas para reiniciar el formulario sin cerrar el dialogo.
   * Se usa al encadenar varias peliculas seguidas.
   */
  formKey?: string | number
  onSubmit: (values: OptionFormValues, intent: SubmitIntent) => void
}

function toFormValues(option: PollOptionDTO | null | undefined): OptionFormValues {
  if (!option) return emptyOptionForm
  return {
    title: option.title,
    description: option.description ?? '',
    genre: option.genre ?? '',
    year: option.year === null ? '' : String(option.year),
    durationMinutes: option.durationMinutes === null ? '' : String(option.durationMinutes),
    showtime: option.showtime ?? '',
    posterKey: option.posterKey,
  }
}

interface OptionFormProps {
  option: PollOptionDTO | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: OptionFormValues, intent: SubmitIntent) => void
}

/**
 * Cuerpo del formulario.
 *
 * Vive dentro de `DialogContent`, que Radix solo monta mientras el dialogo
 * esta abierto. Asi cada apertura parte de los valores correctos sin
 * necesidad de reinicializar el estado desde un efecto.
 */
function OptionForm({ option, submitting, onCancel, onSubmit }: OptionFormProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(option?.posterUrl ?? null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OptionFormValues>({
    resolver: zodResolver(optionFormSchema),
    defaultValues: toFormValues(option),
  })

  /**
   * Cada boton valida y envia con su propia intencion. No hay estado
   * compartido entre ellos: la intencion viaja en la propia llamada.
   */
  const submitWith = (intent: SubmitIntent) => handleSubmit((values) => onSubmit(values, intent))

  return (
    // Enviar con Enter equivale a "guardar y cerrar".
    <form onSubmit={submitWith('close')} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-5">
          <Field id="option-title" label="Titulo" required error={errors.title?.message}>
            <Input
              {...register('title')}
              {...fieldAria('option-title', false, errors.title?.message, true)}
              placeholder="Interstellar"
              autoComplete="off"
              disabled={submitting}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="option-genre" label="Genero" error={errors.genre?.message}>
              <Input
                {...register('genre')}
                {...fieldAria('option-genre', false, errors.genre?.message)}
                placeholder="Ciencia ficcion"
                disabled={submitting}
              />
            </Field>

            <Field id="option-year" label="Ano" error={errors.year?.message}>
              <Input
                {...register('year')}
                {...fieldAria('option-year', false, errors.year?.message)}
                inputMode="numeric"
                placeholder="2014"
                disabled={submitting}
              />
            </Field>

            <Field
              id="option-duration"
              label="Duracion"
              hint="En minutos"
              error={errors.durationMinutes?.message}
            >
              <Input
                {...register('durationMinutes')}
                {...fieldAria('option-duration', true, errors.durationMinutes?.message)}
                inputMode="numeric"
                placeholder="169"
                disabled={submitting}
              />
            </Field>
          </div>

          <Field
            id="option-showtime"
            label="Hora de proyeccion"
            hint="Texto libre, por ejemplo 20:00"
            error={errors.showtime?.message}
          >
            <Input
              {...register('showtime')}
              {...fieldAria('option-showtime', true, errors.showtime?.message)}
              placeholder="20:00"
              disabled={submitting}
            />
          </Field>

          <Field id="option-description" label="Sinopsis" error={errors.description?.message}>
            <Textarea
              {...register('description')}
              {...fieldAria('option-description', false, errors.description?.message)}
              rows={3}
              disabled={submitting}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Cartelera</p>
          <Controller
            control={control}
            name="posterKey"
            render={({ field }) => (
              <ImageUploader
                value={field.value}
                previewUrl={previewUrl}
                disabled={submitting}
                onChange={(key, url) => {
                  field.onChange(key)
                  setPreviewUrl(url)
                }}
              />
            )}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>

        {/*
          Al preparar una cartelera se encadenan varias peliculas seguidas.
          Este boton guarda y deja el formulario limpio para la siguiente,
          sin tener que reabrir el dialogo cada vez.
        */}
        {option ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={submitWith('add-another')}
          >
            <Plus />
            Guardar y agregar otra
          </Button>
        )}

        <Button type="button" disabled={submitting} onClick={submitWith('close')}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {option ? 'Guardar cambios' : 'Agregar y cerrar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Alta y edicion de una pelicula de la cartelera. */
export function OptionFormDialog({
  open,
  onOpenChange,
  option = null,
  submitting = false,
  formKey = 'nueva',
  onSubmit,
}: OptionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{option ? 'Editar pelicula' : 'Agregar pelicula'}</DialogTitle>
          <DialogDescription>
            Solo el titulo es obligatorio. Sube la cartelera en el recuadro de la derecha: es la
            imagen que veran los trabajadores al votar.
          </DialogDescription>
        </DialogHeader>

        <OptionForm
          key={option?.id ?? formKey}
          option={option}
          submitting={submitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
