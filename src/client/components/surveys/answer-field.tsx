import { Check } from 'lucide-react'
import { Input } from '@/client/components/ui/input'
import { Textarea } from '@/client/components/ui/textarea'
import { cn } from '@/client/lib/utils'
import type { SurveyAnswerInput } from '@/shared/schemas'
import type { SurveyQuestionDTO } from '@/shared/types'

interface AnswerFieldProps {
  question: SurveyQuestionDTO
  value: SurveyAnswerInput | undefined
  disabled?: boolean
  onChange: (answer: SurveyAnswerInput) => void
}

/**
 * El control con el que se responde a una pregunta.
 *
 * Cada tipo tiene su forma de respuesta y aqui se construye ya con la forma
 * correcta, de modo que el formulario no pueda enviar, por ejemplo, un texto
 * a una pregunta de escala. El servidor lo vuelve a comprobar de todas
 * formas: esto es comodidad, no seguridad.
 */
export function AnswerField({ question, value, disabled = false, onChange }: AnswerFieldProps) {
  const elegidas = value && 'optionIds' in value ? value.optionIds : []

  if (question.type === 'SINGLE' || question.type === 'MULTIPLE') {
    const multiple = question.type === 'MULTIPLE'

    const alternar = (optionId: string) => {
      if (!multiple) {
        onChange({ questionId: question.id, optionIds: [optionId] })
        return
      }
      const ya = elegidas.includes(optionId)
      const siguiente = ya
        ? elegidas.filter((id) => id !== optionId)
        : [...elegidas, optionId]
      onChange({ questionId: question.id, optionIds: siguiente })
    }

    return (
      <div
        role={multiple ? 'group' : 'radiogroup'}
        aria-labelledby={'pregunta-' + question.id}
        className="space-y-2"
      >
        {question.options.map((opcion) => {
          const marcada = elegidas.includes(opcion.id)
          return (
            <button
              key={opcion.id}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={marcada}
              disabled={disabled}
              onClick={() => alternar(opcion.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3.5 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                marcada
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-input hover:bg-accent/50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center border',
                  multiple ? 'rounded-[5px]' : 'rounded-full',
                  marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}
              >
                {marcada ? <Check className="size-3.5" aria-hidden="true" /> : null}
              </span>
              {opcion.text}
            </button>
          )
        })}

        {multiple ? (
          <p className="text-xs text-muted-foreground">
            {limiteTexto(question)} · has marcado {elegidas.length}
          </p>
        ) : null}
      </div>
    )
  }

  if (question.type === 'TEXT') {
    const texto = value && 'text' in value ? value.text : ''
    return (
      <Textarea
        id={'campo-' + question.id}
        value={texto}
        disabled={disabled}
        rows={4}
        maxLength={2000}
        placeholder="Escribe tu respuesta"
        onChange={(evento) => onChange({ questionId: question.id, text: evento.target.value })}
      />
    )
  }

  // SCALE: del 1 al 10, con los extremos etiquetados si se han puesto.
  const actual = value && 'scale' in value ? value.scale : null
  const peldanos = Array.from(
    { length: question.scaleMax - question.scaleMin + 1 },
    (_, indice) => question.scaleMin + indice,
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={'pregunta-' + question.id}>
        {peldanos.map((peldano) => {
          const marcado = actual === peldano
          return (
            <button
              key={peldano}
              type="button"
              role="radio"
              aria-checked={marcado}
              aria-label={'Valoracion ' + peldano}
              disabled={disabled}
              onClick={() => onChange({ questionId: question.id, scale: peldano })}
              className={cn(
                'size-10 rounded-lg border text-sm font-medium tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                marcado
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-accent/50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {peldano}
            </button>
          )
        })}
      </div>

      {question.scaleMinLabel || question.scaleMaxLabel ? (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{question.scaleMinLabel ?? question.scaleMin}</span>
          <span>{question.scaleMaxLabel ?? question.scaleMax}</span>
        </div>
      ) : null}
    </div>
  )
}

/** Texto que explica cuantas opciones se pueden marcar. */
function limiteTexto(question: SurveyQuestionDTO): string {
  const { minChoices: min, maxChoices: max } = question
  if (min !== null && max !== null) return 'Marca entre ' + min + ' y ' + max
  if (max !== null) return 'Marca como maximo ' + max
  if (min !== null) return 'Marca al menos ' + min
  return 'Marca todas las que quieras'
}

/** Campo de solo lectura para ver una respuesta ya enviada. */
export function AnswerReadonly({ question, value }: { question: SurveyQuestionDTO; value: SurveyAnswerInput | undefined }) {
  if (!value) return <p className="text-sm text-muted-foreground">Sin responder</p>

  if ('optionIds' in value) {
    const textos = question.options
      .filter((opcion) => value.optionIds.includes(opcion.id))
      .map((opcion) => opcion.text)
    return <p className="text-sm font-medium">{textos.join(', ') || 'Sin responder'}</p>
  }
  if ('text' in value) {
    return <p className="whitespace-pre-wrap text-sm">{value.text}</p>
  }
  return (
    <p className="text-sm font-medium tabular-nums">
      {value.scale} <span className="text-muted-foreground">de {question.scaleMax}</span>
    </p>
  )
}

/** Input de apoyo para formularios simples. Reexportado por comodidad. */
export { Input }
