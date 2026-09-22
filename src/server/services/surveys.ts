import { ERROR_CODES } from '../../shared/constants'
import { isAnonymityAtRisk, percentage, resolveSurveyStatus } from '../../shared/policy'
import {
  esRespuestaDeEscala,
  esRespuestaDeOpciones,
  esRespuestaDeTexto,
  type SurveyAnswerInput,
} from '../../shared/schemas'
import type {
  SurveyParticipationDTO,
  SurveyQuestionDTO,
  SurveyQuestionResultDTO,
  SurveyResultsDTO,
} from '../../shared/types'
import {
  alDia,
  countAnsweredPerQuestion,
  countEligible,
  countSubmissions,
  listParticipants,
  listScheduledSurveys,
  listTextAnswers,
  tallyOptions,
  tallyScales,
  toSurveyRuleState,
  updateSurvey,
  type AnswerToInsert,
  type SurveyRow,
} from '../db/surveys'
import { newId } from '../lib/crypto'
import { AppError } from '../lib/errors'

/**
 * Reglas de las encuestas que necesitan tocar la base de datos.
 *
 * Lo mas delicado esta en `normalizarRespuestas`: es quien comprueba que lo
 * que llega encaja con el tipo REAL de cada pregunta. El esquema de Zod ya
 * garantiza la forma del cuerpo, pero no puede saber si la pregunta a la que
 * responde es de texto o de escala; eso solo lo sabe el servidor.
 */

const invalido = (mensaje: string) =>
  new AppError(422, ERROR_CODES.SURVEY_ANSWERS_INCOMPLETE, mensaje)

/**
 * Convierte las respuestas recibidas en filas listas para guardar.
 *
 * Comprueba, contra las preguntas reales de la encuesta:
 *   - que no sobren respuestas a preguntas de otra encuesta;
 *   - que la forma corresponda al tipo de la pregunta;
 *   - que las opciones elegidas sean de esa pregunta y no de otra;
 *   - los limites de opciones marcadas y el rango de la escala;
 *   - que no falte ninguna pregunta obligatoria.
 */
export function normalizarRespuestas(
  preguntas: SurveyQuestionDTO[],
  entrada: SurveyAnswerInput[],
): AnswerToInsert[] {
  const porId = new Map(preguntas.map((pregunta) => [pregunta.id, pregunta]))
  const respondidas = new Set<string>()
  const filas: AnswerToInsert[] = []

  for (const respuesta of entrada) {
    const pregunta = porId.get(respuesta.questionId)
    if (!pregunta) throw invalido('Hay una respuesta que no corresponde a esta encuesta')
    if (respondidas.has(pregunta.id)) {
      throw invalido('Hay dos respuestas para la pregunta "' + pregunta.text + '"')
    }
    respondidas.add(pregunta.id)

    if (pregunta.type === 'SINGLE' || pregunta.type === 'MULTIPLE') {
      if (!esRespuestaDeOpciones(respuesta)) {
        throw invalido('La pregunta "' + pregunta.text + '" se responde eligiendo opciones')
      }

      const validas = new Set(pregunta.options.map((opcion) => opcion.id))
      const elegidas = [...new Set(respuesta.optionIds)]

      for (const id of elegidas) {
        if (!validas.has(id)) {
          throw invalido('Has elegido una opcion que no pertenece a "' + pregunta.text + '"')
        }
      }

      if (pregunta.type === 'SINGLE' && elegidas.length > 1) {
        throw invalido('En "' + pregunta.text + '" solo se puede elegir una opcion')
      }

      if (elegidas.length === 0) {
        if (pregunta.required) throw invalido('Falta responder a "' + pregunta.text + '"')
        continue
      }

      if (pregunta.type === 'MULTIPLE') {
        const min = pregunta.minChoices
        const max = pregunta.maxChoices
        if (min !== null && elegidas.length < min) {
          throw invalido('En "' + pregunta.text + '" debes marcar al menos ' + min)
        }
        if (max !== null && elegidas.length > max) {
          throw invalido('En "' + pregunta.text + '" no puedes marcar mas de ' + max)
        }
      }

      for (const optionId of elegidas) {
        filas.push({ id: newId(), questionId: pregunta.id, optionId, textValue: null, scaleValue: null })
      }
      continue
    }

    if (pregunta.type === 'TEXT') {
      if (!esRespuestaDeTexto(respuesta)) {
        throw invalido('La pregunta "' + pregunta.text + '" se responde escribiendo')
      }
      const texto = respuesta.text.trim()
      if (texto.length === 0) {
        if (pregunta.required) throw invalido('Falta responder a "' + pregunta.text + '"')
        continue
      }
      filas.push({ id: newId(), questionId: pregunta.id, optionId: null, textValue: texto, scaleValue: null })
      continue
    }

    // SCALE
    if (!esRespuestaDeEscala(respuesta)) {
      throw invalido('La pregunta "' + pregunta.text + '" se responde con una valoracion')
    }
    if (respuesta.scale < pregunta.scaleMin || respuesta.scale > pregunta.scaleMax) {
      throw invalido(
        'La valoracion de "' + pregunta.text + '" debe estar entre ' +
          pregunta.scaleMin + ' y ' + pregunta.scaleMax,
      )
    }
    filas.push({
      id: newId(),
      questionId: pregunta.id,
      optionId: null,
      textValue: null,
      scaleValue: respuesta.scale,
    })
  }

  const faltan = preguntas.filter(
    (pregunta) => pregunta.required && !respondidas.has(pregunta.id),
  )
  if (faltan.length > 0) {
    throw invalido('Falta responder a "' + faltan[0]!.text + '"')
  }

  return filas
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/**
 * Recuento de una encuesta.
 *
 * `includeOverview` decide si viaja el bloque de organizacion (censo y quien
 * falta), igual que en las votaciones: solo para administradores. Las
 * respuestas agregadas no identifican a nadie ni en una encuesta anonima ni
 * en una identificada, porque aqui nunca se consulta el autor de un envio.
 */
export async function buildSurveyResults(
  db: D1Database,
  survey: SurveyRow,
  preguntas: SurveyQuestionDTO[],
  includeOverview: boolean,
): Promise<SurveyResultsDTO> {
  /*
   * Los textos solo se leen si quien mira es administrador. Para un
   * participante no es que se filtren despues: no se consultan.
   */
  const [envios, opciones, escalas, textos, respondidasPorPregunta] = await Promise.all([
    countSubmissions(db, survey.id),
    tallyOptions(db, survey.id),
    tallyScales(db, survey.id),
    includeOverview ? listTextAnswers(db, survey.id) : Promise.resolve([]),
    countAnsweredPerQuestion(db, survey.id),
  ])

  const opcionesPorPregunta = new Map<string, typeof opciones>()
  for (const fila of opciones) {
    const lista = opcionesPorPregunta.get(fila.question_id) ?? []
    lista.push(fila)
    opcionesPorPregunta.set(fila.question_id, lista)
  }

  const escalasPorPregunta = new Map<string, typeof escalas>()
  for (const fila of escalas) {
    const lista = escalasPorPregunta.get(fila.question_id) ?? []
    lista.push(fila)
    escalasPorPregunta.set(fila.question_id, lista)
  }

  const textosPorPregunta = new Map<string, string[]>()
  for (const fila of textos) {
    const lista = textosPorPregunta.get(fila.question_id) ?? []
    lista.push(fila.text_value)
    textosPorPregunta.set(fila.question_id, lista)
  }

  const respondidas = new Map(respondidasPorPregunta.map((f) => [f.question_id, f.total]))

  const resultados: SurveyQuestionResultDTO[] = preguntas.map((pregunta) => {
    const contestada = respondidas.get(pregunta.id) ?? 0

    const filasEscala = escalasPorPregunta.get(pregunta.id) ?? []
    const totalEscala = filasEscala.reduce((suma, f) => suma + f.total, 0)
    const sumaEscala = filasEscala.reduce((suma, f) => suma + f.scale_value * f.total, 0)

    return {
      questionId: pregunta.id,
      text: pregunta.text,
      type: pregunta.type,
      answered: contestada,
      options: (opcionesPorPregunta.get(pregunta.id) ?? []).map((fila) => ({
        optionId: fila.option_id,
        text: fila.text,
        count: fila.total,
        // Sobre quienes contestaron esa pregunta, no sobre el total de envios:
        // en una pregunta opcional los dos numeros no coinciden.
        percentage: percentage(fila.total, contestada),
      })),
      scale:
        pregunta.type === 'SCALE'
          ? {
              average: totalEscala === 0 ? 0 : Math.round((sumaEscala / totalEscala) * 10) / 10,
              distribution: Array.from(
                { length: pregunta.scaleMax - pregunta.scaleMin + 1 },
                (_, indice) => {
                  const valor = pregunta.scaleMin + indice
                  return {
                    value: valor,
                    count: filasEscala.find((f) => f.scale_value === valor)?.total ?? 0,
                  }
                },
              ),
            }
          : null,
      texts: pregunta.type === 'TEXT' ? (textosPorPregunta.get(pregunta.id) ?? []) : [],
      // El numero si viaja siempre: decir cuantas hay no revela ninguna.
      textCount: pregunta.type === 'TEXT' ? contestada : 0,
    }
  })

  return {
    surveyId: survey.id,
    status: survey.status,
    anonymous: survey.anonymous === 1,
    submissions: envios,
    questions: resultados,
    overview: includeOverview ? await buildSurveyOverview(db, survey.id, envios, survey.anonymous === 1) : null,
    generatedAt: new Date().toISOString(),
  }
}

async function buildSurveyOverview(
  db: D1Database,
  surveyId: string,
  envios: number,
  anonima: boolean,
) {
  const [censo, participantes] = await Promise.all([
    countEligible(db),
    listParticipants(db, surveyId),
  ])

  const respondieron = participantes.filter((fila) => fila.submitted_at !== null).length

  return {
    eligible: censo,
    answered: respondieron,
    pending: Math.max(0, censo - respondieron),
    participationRate: percentage(respondieron, censo),
    anonymityAtRisk: isAnonymityAtRisk(anonima, envios),
  }
}

/**
 * Quien ha respondido y quien no.
 *
 * Sirve igual en encuestas anonimas: sale de la tabla de participacion, que
 * no tiene ninguna via hacia las respuestas. En las anonimas ademas se
 * redondea la hora al dia, para que no se pueda cruzar con nada.
 */
export async function buildSurveyParticipation(
  db: D1Database,
  survey: SurveyRow,
): Promise<SurveyParticipationDTO> {
  const anonima = survey.anonymous === 1
  const filas = await listParticipants(db, survey.id)

  const users = filas.map((fila) => ({
    userId: fila.user_id,
    name: fila.name,
    username: fila.username,
    hasAnswered: fila.submitted_at !== null,
    answeredAt: fila.submitted_at === null ? null : anonima ? alDia(fila.submitted_at) : fila.submitted_at,
  }))

  const respondieron = users.filter((fila) => fila.hasAnswered).length

  return {
    surveyId: survey.id,
    anonymous: anonima,
    eligible: users.length,
    answered: respondieron,
    pending: users.length - respondieron,
    participationRate: percentage(respondieron, users.length),
    users,
  }
}

/**
 * Abre y cierra las encuestas programadas.
 *
 * Igual que con las votaciones, es una red de seguridad: el estado efectivo
 * se recalcula tambien al leer cada encuesta, asi que el enlace funciona en
 * el minuto exacto aunque el cron todavia no haya pasado. Esto solo lo
 * persiste, para que las listas y los recuentos no dependan del momento en
 * que se consulten.
 */
export async function syncScheduledSurveys(
  db: D1Database,
  now: Date = new Date(),
): Promise<{ opened: number; closed: number }> {
  const candidatas = await listScheduledSurveys(db, now.toISOString())
  let opened = 0
  let closed = 0

  for (const fila of candidatas) {
    const destino = resolveSurveyStatus(toSurveyRuleState(fila), now)
    if (destino === fila.status) continue

    const sello = destino === 'ACTIVE' ? 'opened_at' : destino === 'CLOSED' ? 'closed_at' : null
    await updateSurvey(db, fila.id, {
      status: destino,
      updated_at: now.toISOString(),
      ...(sello ? { [sello]: now.toISOString() } : {}),
    })

    if (destino === 'ACTIVE') opened += 1
    if (destino === 'CLOSED') closed += 1
  }

  return { opened, closed }
}
