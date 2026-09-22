import { ChevronDown, Lock, MessageSquareQuote, Search, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { formatPercentage, pluralize } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import { ETIQUETAS_TIPO } from './question-dialog'
import type { SurveyQuestionResultDTO, SurveyResultsDTO } from '@/shared/types'

/**
 * Resultados de una encuesta.
 *
 * Con 26 preguntas y 82 personas, una lista de 26 graficos no se lee: hay que
 * recorrerla entera para sacar una conclusion. Por eso hay dos vistas:
 *
 *   Resumen  agrupa las preguntas que comparten las mismas opciones en una
 *            tabla comparativa ordenada, que es donde se ve de un vistazo
 *            que esta mejor y que peor.
 *   Detalle  cada pregunta por separado, en el orden del cuestionario.
 *
 * Todo lo que se muestra son agregados. Las respuestas escritas solo llegan
 * al administrador; al resto se les dice cuantas hay, no cuales.
 */
export function SurveyResults({ results }: { results: SurveyResultsDTO }) {
  const grupos = useMemo(() => agrupar(results.questions), [results.questions])

  if (results.submissions === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">Todavia no hay respuestas.</p>
        </CardContent>
      </Card>
    )
  }

  const hayComparables = grupos.comparables.length > 0

  return (
    <div className="space-y-6">
      {results.overview?.anonymityAtRisk ? <AvisoAnonimato results={results} /> : null}

      {!hayComparables ? (
        <Detalle results={results} />
      ) : (
        <Tabs defaultValue="resumen" className="space-y-6">
          <TabsList>
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-6">
            {grupos.comparables.map((grupo) => (
              <Comparativa key={grupo.firma} grupo={grupo} />
            ))}

            {grupos.escalas.length > 0 ? <ResumenEscalas preguntas={grupos.escalas} /> : null}
            {grupos.textos.length > 0 ? <ResumenTextos preguntas={grupos.textos} /> : null}
            {grupos.sueltas.length > 0 ? (
              <div className="space-y-6">
                {grupos.sueltas.map((pregunta) => (
                  <ResultadoPregunta
                    key={pregunta.questionId}
                    pregunta={pregunta}
                    numero={results.questions.indexOf(pregunta) + 1}
                    envios={results.submissions}
                  />
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="detalle">
            <Detalle results={results} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agrupacion
// ---------------------------------------------------------------------------

interface Grupo {
  /** Las opciones que comparten, en orden. Identifica al grupo. */
  firma: string
  etiquetas: string[]
  preguntas: SurveyQuestionResultDTO[]
}

/**
 * Reparte las preguntas segun se puedan comparar entre si.
 *
 * Dos preguntas son comparables cuando ofrecen exactamente las mismas
 * opciones: entonces tiene sentido ponerlas en la misma tabla y ordenarlas.
 * Con una sola pregunta por juego de opciones no hay nada que comparar, y se
 * deja suelta para que no aparezca una "tabla" de una fila.
 */
function agrupar(preguntas: SurveyQuestionResultDTO[]) {
  const porFirma = new Map<string, SurveyQuestionResultDTO[]>()

  const escalas = preguntas.filter((p) => p.type === 'SCALE')
  const textos = preguntas.filter((p) => p.type === 'TEXT')

  for (const pregunta of preguntas) {
    if (pregunta.type !== 'SINGLE' && pregunta.type !== 'MULTIPLE') continue
    const firma = pregunta.type + '::' + pregunta.options.map((o) => o.text).join('|')
    porFirma.set(firma, [...(porFirma.get(firma) ?? []), pregunta])
  }

  const comparables: Grupo[] = []
  const sueltas: SurveyQuestionResultDTO[] = []

  for (const [firma, lista] of porFirma) {
    if (lista.length < 2) {
      sueltas.push(...lista)
      continue
    }
    comparables.push({
      firma,
      etiquetas: lista[0]!.options.map((o) => o.text),
      preguntas: lista,
    })
  }

  // El grupo mas numeroso primero: suele ser el nucleo del cuestionario.
  comparables.sort((a, b) => b.preguntas.length - a.preguntas.length)

  return { comparables, escalas, textos, sueltas }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

/** Tonos del mas marcado al mas claro, en el orden de las opciones. */
const TONOS = ['bg-primary', 'bg-foreground/45', 'bg-foreground/22', 'bg-foreground/12', 'bg-muted']

function Comparativa({ grupo }: { grupo: Grupo }) {
  const primera = grupo.etiquetas[0] ?? ''

  /*
   * Se ordena por el peso de la PRIMERA opcion, y se dice en la cabecera cual
   * es. No se interpreta si una opcion es buena o mala: el sistema no puede
   * saberlo y fingir que si llevaria a pintar de verde lo que no toca.
   */
  const ordenadas = [...grupo.preguntas].sort(
    (a, b) => (b.options[0]?.percentage ?? 0) - (a.options[0]?.percentage ?? 0),
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{pluralize(grupo.preguntas.length, 'afirmacion', 'afirmaciones')} comparables</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ordenadas por <strong className="text-foreground">{primera}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          {grupo.etiquetas.map((etiqueta, indice) => (
            <span key={etiqueta} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2.5 rounded-sm', TONOS[indice] ?? 'bg-muted')} />
              {etiqueta}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {ordenadas.map((pregunta) => (
          <div key={pregunta.questionId} className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
            <p className="text-sm leading-snug">{pregunta.text}</p>

            <div className="flex items-center gap-3 sm:w-72">
              <div
                className="flex h-5 flex-1 overflow-hidden rounded-md bg-muted"
                role="meter"
                aria-valuenow={pregunta.options[0]?.percentage ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={
                  pregunta.text + ': ' + formatPercentage(pregunta.options[0]?.percentage ?? 0) +
                  ' ' + primera
                }
              >
                {pregunta.options.map((opcion, indice) => (
                  <div
                    key={opcion.optionId}
                    className={cn(TONOS[indice] ?? 'bg-muted')}
                    style={{ width: opcion.percentage + '%' }}
                    title={opcion.text + ': ' + formatPercentage(opcion.percentage)}
                  />
                ))}
              </div>

              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                {formatPercentage(pregunta.options[0]?.percentage ?? 0)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ResumenEscalas({ preguntas }: { preguntas: SurveyQuestionResultDTO[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Valoraciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {preguntas.map((pregunta) => (
          <div key={pregunta.questionId} className="flex items-baseline justify-between gap-4">
            <p className="text-sm leading-snug">{pregunta.text}</p>
            <p className="shrink-0">
              <span className="text-2xl font-semibold tabular-nums">
                {pregunta.scale?.average ?? 0}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">de 10</span>
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ResumenTextos({ preguntas }: { preguntas: SurveyQuestionResultDTO[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Respuestas escritas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {preguntas.map((pregunta) => (
          <Comentarios key={pregunta.questionId} pregunta={pregunta} />
        ))}
      </CardContent>
    </Card>
  )
}

function AvisoAnonimato({ results }: { results: SurveyResultsDTO }) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="flex gap-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">El anonimato es debil con tan pocas respuestas</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Hay {pluralize(results.submissions, 'respuesta', 'respuestas')}. Con esa cantidad,
            quien conozca al equipo puede deducir quien contesto que. Conviene esperar a tener
            mas antes de compartir estos resultados.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

function Detalle({ results }: { results: SurveyResultsDTO }) {
  return (
    <div className="space-y-6">
      {results.questions.map((pregunta, indice) => (
        <ResultadoPregunta
          key={pregunta.questionId}
          pregunta={pregunta}
          numero={indice + 1}
          envios={results.submissions}
        />
      ))}
    </div>
  )
}

function ResultadoPregunta({
  pregunta,
  numero,
  envios,
}: {
  pregunta: SurveyQuestionResultDTO
  numero: number
  envios: number
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-baseline gap-2">
            <span className="text-muted-foreground tabular-nums">{numero}.</span>
            {pregunta.text}
          </CardTitle>
          <Badge variant="secondary">{ETIQUETAS_TIPO[pregunta.type]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {pregunta.answered} de {pluralize(envios, 'respuesta', 'respuestas')} contestaron
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {pregunta.type === 'TEXT' ? (
          <Comentarios pregunta={pregunta} />
        ) : pregunta.type === 'SCALE' ? (
          <Escala pregunta={pregunta} />
        ) : (
          <Opciones pregunta={pregunta} />
        )}
      </CardContent>
    </Card>
  )
}

function Opciones({ pregunta }: { pregunta: SurveyQuestionResultDTO }) {
  const maximo = Math.max(0, ...pregunta.options.map((opcion) => opcion.count))

  return (
    <div className="space-y-4">
      {pregunta.options.map((opcion) => {
        const gana = opcion.count === maximo && maximo > 0
        return (
          <div key={opcion.optionId} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{opcion.text}</span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{formatPercentage(opcion.percentage)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {pluralize(opcion.count, 'voto', 'votos')}
                </span>
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuenow={opcion.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={opcion.text + ': ' + formatPercentage(opcion.percentage)}
            >
              <div
                className={cn('h-full rounded-full', gana ? 'bg-primary' : 'bg-foreground/35')}
                style={{ width: opcion.percentage + '%' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Escala({ pregunta }: { pregunta: SurveyQuestionResultDTO }) {
  const escala = pregunta.scale
  if (!escala) return null

  const maximo = Math.max(1, ...escala.distribution.map((peldano) => peldano.count))

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{escala.average}</span>
        <span className="text-sm text-muted-foreground">de media</span>
      </div>

      {/* Histograma: la altura dice cuanta gente eligio cada numero. */}
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {escala.distribution.map((peldano) => (
          <div key={peldano.value} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {peldano.count > 0 ? peldano.count : ''}
            </span>
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height: Math.max(4, (peldano.count / maximo) * 72) + 'px' }}
            />
            <span className="text-[10px] text-muted-foreground tabular-nums">{peldano.value}</span>
          </div>
        ))}
      </div>

      <ul className="sr-only">
        {escala.distribution.map((peldano) => (
          <li key={peldano.value}>
            {peldano.value}: {pluralize(peldano.count, 'respuesta', 'respuestas')}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

/**
 * Respuestas escritas a una pregunta.
 *
 * Empiezan plegadas. Con 82 personas y cuatro preguntas de texto salen
 * cientos de comentarios, y desplegados de golpe entierran todo lo demas.
 * Al abrirlas aparece un buscador, porque leerlos de arriba abajo no es
 * forma de encontrar nada.
 */
function Comentarios({ pregunta }: { pregunta: SurveyQuestionResultDTO }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase()
    if (aguja.length === 0) return pregunta.texts
    return pregunta.texts.filter((texto) => texto.toLowerCase().includes(aguja))
  }, [pregunta.texts, busqueda])

  if (pregunta.textCount === 0) {
    return <p className="text-sm text-muted-foreground">Nadie ha escrito nada.</p>
  }

  /*
   * Hay comentarios pero no han llegado: quien mira no es administrador.
   * Se dice cuantos son, que no revela ninguno, en lugar de dejar el hueco
   * vacio como si nadie hubiera escrito.
   */
  if (pregunta.texts.length === 0) {
    return (
      <div className="flex gap-2.5 rounded-lg border border-border bg-surface-subtle p-3.5">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {pluralize(pregunta.textCount, 'persona ha escrito', 'personas han escrito')} su
          respuesta. Solo las lee el administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        aria-expanded={abierto}
        onClick={() => setAbierto((actual) => !actual)}
      >
        <span className="flex items-center gap-2">
          <MessageSquareQuote className="size-4" aria-hidden="true" />
          {/* En el resumen hace falta saber a que pregunta responden. */}
          <span className="truncate">{pregunta.text}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{pregunta.texts.length}</Badge>
          <ChevronDown
            className={cn('size-4 transition-transform', abierto && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </Button>

      {abierto ? (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={busqueda}
              placeholder="Buscar en los comentarios…"
              aria-label={'Buscar en los comentarios de: ' + pregunta.text}
              className="pl-9"
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </div>

          {busqueda.trim().length > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {filtrados.length} de {pregunta.texts.length}
            </p>
          ) : null}

          {filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningun comentario contiene ese texto.</p>
          ) : (
            <ul className="space-y-2.5">
              {filtrados.map((texto, indice) => (
                <li
                  key={indice}
                  className="flex gap-2.5 rounded-lg border border-border bg-surface-subtle p-3.5"
                >
                  <MessageSquareQuote
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
