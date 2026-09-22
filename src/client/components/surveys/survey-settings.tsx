import { EyeOff, Lock } from 'lucide-react'
import { Card, CardContent } from '@/client/components/ui/card'
import { Label } from '@/client/components/ui/label'
import { Switch } from '@/client/components/ui/switch'

export interface SurveySettingsValues {
  anonymous: boolean
  allowResponseChange: boolean
  showLiveResults: boolean
  showResultsAfterClose: boolean
}

interface SurveySettingsFormProps {
  values: SurveySettingsValues
  /**
   * El anonimato solo se puede tocar en borrador: cambiarlo despues no
   * reescribiria lo ya guardado.
   */
  anonymityLocked?: boolean
  disabled?: boolean
  onChange: (values: SurveySettingsValues) => void
}

/**
 * Las reglas de una encuesta.
 *
 * Es el mismo bloque al crearla y al editarla. Estaba duplicado y acabaria
 * divergiendo: bastaria con cambiar un texto en un sitio para que la
 * pantalla de creacion prometiera algo distinto de la de edicion.
 */
export function SurveySettingsForm({
  values,
  anonymityLocked = false,
  disabled = false,
  onChange,
}: SurveySettingsFormProps) {
  const cambiar = (parcial: Partial<SurveySettingsValues>) => {
    const siguiente = { ...values, ...parcial }
    // Una anonima nunca admite cambio de respuesta: no hay envio que buscar.
    if (siguiente.anonymous) siguiente.allowResponseChange = false
    onChange(siguiente)
  }

  return (
    <div className="space-y-6">
      <Card className={values.anonymous ? 'border-primary/40' : undefined}>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="anonymous" className="flex items-center gap-2">
                <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" />
                Encuesta anonima
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Las respuestas se guardan sin ninguna relacion con quien las envia. Seguiras
                sabiendo quien ha participado, para poder recordarselo a quien falte, pero nadie
                podra saber que contesto cada persona.
              </p>
            </div>
            <Switch
              id="anonymous"
              checked={values.anonymous}
              disabled={disabled || anonymityLocked}
              onCheckedChange={(valor) => cambiar({ anonymous: valor })}
            />
          </div>

          {anonymityLocked ? (
            <p className="flex gap-2 rounded-lg border border-border bg-surface-subtle p-3.5 text-xs leading-relaxed text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                El anonimato ya no se puede cambiar: solo se toca mientras la encuesta es un
                borrador. Activarlo ahora no anonimizaria lo ya guardado, y desactivarlo
                prometeria una identificacion que no existe.
              </span>
            </p>
          ) : values.anonymous ? (
            <p className="rounded-lg border border-border bg-surface-subtle p-3.5 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">
                Al ser anonima no se podra cambiar la respuesta
              </strong>
              , ni siquiera por quien la envio: el sistema no guarda de quien es cada una, asi que
              no hay forma de encontrarla. Esto no se puede cambiar una vez publicada.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5">
          <Interruptor
            id="allowResponseChange"
            titulo="Permitir cambiar la respuesta"
            ayuda={
              values.anonymous
                ? 'No disponible en una encuesta anonima.'
                : 'Se puede rehacer mientras la encuesta siga abierta.'
            }
            checked={values.allowResponseChange}
            disabled={disabled || values.anonymous}
            onChange={(valor) => cambiar({ allowResponseChange: valor })}
          />

          <Interruptor
            id="showLiveResults"
            titulo="Mostrar resultados en vivo"
            ayuda="Quien participa ve el recuento por opcion mientras la encuesta esta abierta."
            checked={values.showLiveResults}
            disabled={disabled}
            onChange={(valor) => cambiar({ showLiveResults: valor })}
          />

          <Interruptor
            id="showResultsAfterClose"
            titulo="Mostrar resultados al cerrar"
            ayuda="Quien participa ve el recuento final cuando cierres la encuesta."
            checked={values.showResultsAfterClose}
            disabled={disabled}
            onChange={(valor) => cambiar({ showResultsAfterClose: valor })}
          />

          {/*
            Conviene decir aqui, donde se decide, que es exactamente lo que se
            comparte. Sin esto, "mostrar resultados" suena a mas de lo que es.
          */}
          {values.showLiveResults || values.showResultsAfterClose ? (
            <p className="rounded-lg border border-border bg-surface-subtle p-3.5 text-xs leading-relaxed text-muted-foreground">
              Con esto activado, quien participa ve <strong>solo los recuentos</strong>: cuantas
              personas eligieron cada opcion y la media de las valoraciones. No ve las respuestas
              escritas, ni quien ha contestado, ni cuantos faltan. Eso es siempre tuyo.
            </p>
          ) : (
            <p className="rounded-lg border border-border bg-surface-subtle p-3.5 text-xs leading-relaxed text-muted-foreground">
              Con las dos apagadas, los resultados son <strong>solo para administradores</strong>.
              Quien participa no ve ningun recuento, ni durante ni despues.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Interruptor({
  id,
  titulo,
  ayuda,
  checked,
  disabled = false,
  onChange,
}: {
  id: string
  titulo: string
  ayuda: string
  checked: boolean
  disabled?: boolean
  onChange: (valor: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{titulo}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{ayuda}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
