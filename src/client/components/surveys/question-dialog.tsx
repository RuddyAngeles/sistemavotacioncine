import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/client/components/common/field'
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
import { Label } from '@/client/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Switch } from '@/client/components/ui/switch'
import { Textarea } from '@/client/components/ui/textarea'
import type { SurveyQuestionDTO, SurveyQuestionType } from '@/shared/types'

const ETIQUETAS: Record<SurveyQuestionType, string> = {
  SINGLE: 'Opcion unica',
  MULTIPLE: 'Opcion multiple',
  TEXT: 'Texto libre',
  SCALE: 'Valoracion del 1 al 10',
}

const AYUDAS: Record<SurveyQuestionType, string> = {
  SINGLE: 'Se elige una sola de las opciones.',
  MULTIPLE: 'Se pueden marcar varias opciones.',
  TEXT: 'Se responde escribiendo. Util para comentarios.',
  SCALE: 'Se valora con un numero del 1 al 10.',
}

export interface QuestionDraft {
  type: SurveyQuestionType
  text: string
  help: string | null
  required: boolean
  /*
   * Las opciones que ya existen viajan con su id. Sin el, el servidor no
   * puede saber que son las mismas y al guardarlas se llevaria por delante
   * las respuestas que apuntan a ellas.
   */
  options: Array<{ id?: string; text: string }>
  minChoices: number | null
  maxChoices: number | null
  scaleMinLabel: string | null
  scaleMaxLabel: string | null
}

const VACIA: QuestionDraft = {
  type: 'SINGLE',
  text: '',
  help: null,
  required: true,
  options: [{ text: '' }, { text: '' }],
  minChoices: null,
  maxChoices: null,
  scaleMinLabel: null,
  scaleMaxLabel: null,
}

function desdePregunta(pregunta: SurveyQuestionDTO): QuestionDraft {
  return {
    type: pregunta.type,
    text: pregunta.text,
    help: pregunta.help,
    required: pregunta.required,
    options: pregunta.options.map((opcion) => ({ id: opcion.id, text: opcion.text })),
    minChoices: pregunta.minChoices,
    maxChoices: pregunta.maxChoices,
    scaleMinLabel: pregunta.scaleMinLabel,
    scaleMaxLabel: pregunta.scaleMaxLabel,
  }
}

interface QuestionDialogProps {
  open: boolean
  /** Pregunta a editar, o `null` para crear una nueva. */
  question: SurveyQuestionDTO | null
  saving?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (borrador: QuestionDraft) => void
}

/**
 * Alta y edicion de una pregunta.
 *
 * El formulario cambia con el tipo: las opciones solo aparecen donde tienen
 * sentido, y las etiquetas de la escala solo en las valoraciones. Asi no se
 * puede construir una pregunta incoherente desde la pantalla.
 */
export function QuestionDialog(props: QuestionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* Se monta al abrir para que el borrador arranque limpio cada vez. */}
        {props.open ? <Formulario {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({ question, saving = false, onOpenChange, onSubmit }: QuestionDialogProps) {
  const [borrador, setBorrador] = useState<QuestionDraft>(
    question ? desdePregunta(question) : VACIA,
  )
  const [error, setError] = useState<string | null>(null)

  const conOpciones = borrador.type === 'SINGLE' || borrador.type === 'MULTIPLE'

  const cambiarTipo = (type: SurveyQuestionType) => {
    setBorrador((actual) => ({
      ...actual,
      type,
      // Al pasar a texto o escala, las opciones dejan de tener sentido.
      options: type === 'SINGLE' || type === 'MULTIPLE'
        ? actual.options.length >= 2
          ? actual.options
          : [{ text: '' }, { text: '' }]
        : [],
      minChoices: type === 'MULTIPLE' ? actual.minChoices : null,
      maxChoices: type === 'MULTIPLE' ? actual.maxChoices : null,
    }))
  }

  const guardar = () => {
    if (borrador.text.trim().length === 0) {
      setError('Escribe el enunciado de la pregunta')
      return
    }
    if (conOpciones) {
      const limpias = borrador.options.filter((opcion) => opcion.text.trim().length > 0)
      if (limpias.length < 2) {
        setError('Anade al menos dos opciones')
        return
      }
      onSubmit({ ...borrador, text: borrador.text.trim(), options: limpias })
      return
    }
    onSubmit({ ...borrador, text: borrador.text.trim(), options: [] })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{question ? 'Editar pregunta' : 'Nueva pregunta'}</DialogTitle>
        <DialogDescription>
          El tipo decide como se responde y como se cuenta despues.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        <Field id="tipo" label="Tipo de respuesta" hint={AYUDAS[borrador.type]}>
          <Select value={borrador.type} onValueChange={(valor) => cambiarTipo(valor as SurveyQuestionType)}>
            <SelectTrigger id="tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETIQUETAS) as SurveyQuestionType[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {ETIQUETAS[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="enunciado" label="Pregunta" required>
          <Textarea
            id="enunciado"
            rows={2}
            maxLength={500}
            value={borrador.text}
            placeholder="Que quieres preguntar?"
            onChange={(evento) => {
              setError(null)
              setBorrador((actual) => ({ ...actual, text: evento.target.value }))
            }}
          />
        </Field>

        <Field id="ayuda" label="Aclaracion" hint="Opcional. Se muestra debajo del enunciado.">
          <Input
            id="ayuda"
            maxLength={300}
            value={borrador.help ?? ''}
            onChange={(evento) =>
              setBorrador((actual) => ({ ...actual, help: evento.target.value || null }))
            }
          />
        </Field>

        {conOpciones ? (
          <div className="space-y-3">
            <Label>Opciones</Label>
            {borrador.options.map((opcion, indice) => (
              <div key={indice} className="flex items-center gap-2">
                <Input
                  value={opcion.text}
                  maxLength={200}
                  aria-label={'Opcion ' + (indice + 1)}
                  placeholder={'Opcion ' + (indice + 1)}
                  onChange={(evento) => {
                    setError(null)
                    setBorrador((actual) => ({
                      ...actual,
                      options: actual.options.map((o, i) =>
                        i === indice ? { ...o, text: evento.target.value } : o,
                      ),
                    }))
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={'Quitar opcion ' + (indice + 1)}
                  disabled={borrador.options.length <= 2}
                  onClick={() =>
                    setBorrador((actual) => ({
                      ...actual,
                      options: actual.options.filter((_, i) => i !== indice),
                    }))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={borrador.options.length >= 30}
              onClick={() =>
                setBorrador((actual) => ({ ...actual, options: [...actual.options, { text: '' }] }))
              }
            >
              <Plus className="size-4" />
              Anadir opcion
            </Button>
          </div>
        ) : null}

        {borrador.type === 'MULTIPLE' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="min" label="Minimo a marcar" hint="Opcional">
              <Input
                id="min"
                type="number"
                min={1}
                max={30}
                value={borrador.minChoices ?? ''}
                onChange={(evento) =>
                  setBorrador((actual) => ({
                    ...actual,
                    minChoices: evento.target.value ? Number(evento.target.value) : null,
                  }))
                }
              />
            </Field>
            <Field id="max" label="Maximo a marcar" hint="Opcional">
              <Input
                id="max"
                type="number"
                min={1}
                max={30}
                value={borrador.maxChoices ?? ''}
                onChange={(evento) =>
                  setBorrador((actual) => ({
                    ...actual,
                    maxChoices: evento.target.value ? Number(evento.target.value) : null,
                  }))
                }
              />
            </Field>
          </div>
        ) : null}

        {borrador.type === 'SCALE' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="etiqueta-min" label="Etiqueta del 1" hint="Opcional">
              <Input
                id="etiqueta-min"
                maxLength={40}
                placeholder="Nada satisfecho"
                value={borrador.scaleMinLabel ?? ''}
                onChange={(evento) =>
                  setBorrador((actual) => ({ ...actual, scaleMinLabel: evento.target.value || null }))
                }
              />
            </Field>
            <Field id="etiqueta-max" label="Etiqueta del 10" hint="Opcional">
              <Input
                id="etiqueta-max"
                maxLength={40}
                placeholder="Muy satisfecho"
                value={borrador.scaleMaxLabel ?? ''}
                onChange={(evento) =>
                  setBorrador((actual) => ({ ...actual, scaleMaxLabel: evento.target.value || null }))
                }
              />
            </Field>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-subtle p-3.5">
          <div className="space-y-0.5">
            <Label htmlFor="obligatoria">Respuesta obligatoria</Label>
            <p className="text-xs text-muted-foreground">
              Si se desactiva, se puede enviar la encuesta sin contestarla.
            </p>
          </div>
          <Switch
            id="obligatoria"
            checked={borrador.required}
            onCheckedChange={(valor) => setBorrador((actual) => ({ ...actual, required: valor }))}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" disabled={saving} onClick={guardar}>
          {question ? 'Guardar cambios' : 'Anadir pregunta'}
        </Button>
      </DialogFooter>
    </>
  )
}

export { ETIQUETAS as ETIQUETAS_TIPO }
