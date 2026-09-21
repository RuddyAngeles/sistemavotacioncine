import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, Eye, EyeOff, Loader2, Repeat2, UserMinus } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Field, fieldAria } from '@/client/components/common/field'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Switch } from '@/client/components/ui/switch'
import { Textarea } from '@/client/components/ui/textarea'
import { pollFormSchema, type PollFormValues } from '@/client/lib/form-schemas'
import { cn } from '@/client/lib/utils'

interface SettingRowProps {
  id: string
  icon: ComponentType<{ className?: string }>
  title: string
  description: ReactNode
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

/** Fila de configuracion: interruptor + explicacion de que implica. */
function SettingRow({
  id,
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border border-border p-4 transition-colors',
        checked && 'bg-surface-subtle',
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <label htmlFor={id} className="block text-sm font-medium leading-none">
            {title}
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={id + '-description'}
      />
    </div>
  )
}

interface PollFormProps {
  defaultValues: PollFormValues
  submitting?: boolean
  disabled?: boolean
  submitLabel?: string
  /**
   * Al editar solo tiene sentido guardar si algo ha cambiado. Al crear, en
   * cambio, los valores por defecto ya son validos y el boton debe estar
   * activo desde el principio.
   */
  requireDirty?: boolean
  secondaryAction?: ReactNode
  onSubmit: (values: PollFormValues) => void
}

/**
 * Formulario de creacion y edicion de una votacion.
 *
 * Las tres reglas configurables son independientes entre si y se explican en
 * la propia interfaz, porque determinan lo que vera cada trabajador.
 */
export function PollForm({
  defaultValues,
  submitting = false,
  disabled = false,
  submitLabel = 'Guardar borrador',
  requireDirty = true,
  secondaryAction,
  onSubmit,
}: PollFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<PollFormValues>({
    resolver: zodResolver(pollFormSchema),
    defaultValues,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Informacion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field id="title" label="Titulo" required error={errors.title?.message}>
            <Input
              {...register('title')}
              {...fieldAria('title', false, errors.title?.message, true)}
              placeholder="Movie Night — Septiembre"
              autoComplete="off"
              disabled={disabled}
            />
          </Field>

          <Field
            id="description"
            label="Descripcion"
            hint="Se muestra a los trabajadores bajo el titulo."
            error={errors.description?.message}
          >
            <Textarea
              {...register('description')}
              {...fieldAria('description', true, errors.description?.message)}
              rows={3}
              placeholder="Elige la pelicula que veremos este viernes."
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reglas de la votacion</CardTitle>
          <p className="text-sm text-muted-foreground">
            Se aplican en el servidor: cambiarlas afecta de inmediato a lo que puede hacer y ver
            cada trabajador.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            control={control}
            name="allowVoteChange"
            render={({ field }) => (
              <SettingRow
                id="allowVoteChange"
                icon={Repeat2}
                title="Permitir cambiar el voto"
                description="Si esta activo, cada persona puede modificar su eleccion mientras la votacion siga abierta. Si no, el voto queda fijado al emitirlo."
                checked={field.value}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="showLiveResults"
            render={({ field }) => (
              <SettingRow
                id="showLiveResults"
                icon={Eye}
                title="Mostrar resultados en vivo"
                description="Si esta activo, los trabajadores ven el recuento mientras la votacion esta abierta. Si no, el servidor no les envia ningun dato de votos."
                checked={field.value}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="allowNotAttending"
            render={({ field }) => (
              <SettingRow
                id="allowNotAttending"
                icon={UserMinus}
                title="Permitir responder que no se asiste"
                description="Si esta activo, quien no pueda ir lo indica en lugar de elegir pelicula. Cuenta como participacion pero no suma a ninguna pelicula, y el resumen te dice cuantas entradas hacen falta."
                checked={field.value}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="showResultsAfterClose"
            render={({ field }) => (
              <SettingRow
                id="showResultsAfterClose"
                icon={EyeOff}
                title="Mostrar resultados al cerrar"
                description="Si esta activo, al cerrar la votacion los trabajadores podran consultar el resultado final."
                checked={field.value}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            Programacion (opcional)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Si indicas fechas, el sistema abre y cierra la votacion solo. Puedes abrirla o cerrarla
            a mano en cualquier momento.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="startsAt" label="Inicio" error={errors.startsAt?.message}>
            <Input
              type="datetime-local"
              {...register('startsAt')}
              {...fieldAria('startsAt', false, errors.startsAt?.message)}
              disabled={disabled}
            />
          </Field>

          <Field id="endsAt" label="Finalizacion" error={errors.endsAt?.message}>
            <Input
              type="datetime-local"
              {...register('endsAt')}
              {...fieldAria('endsAt', false, errors.endsAt?.message)}
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        <Button type="submit" disabled={disabled || submitting || (requireDirty && !isDirty)}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
