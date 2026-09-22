import { Hono } from 'hono'
import { ERROR_CODES, type ErrorCode } from '../../shared/constants'
import {
  canViewAttendanceDetail,
  canViewSurveyResults,
  evaluateSurvey,
  isSurveyVisible,
  resolveSurveyStatus,
} from '../../shared/policy'
import { submitSurveySchema } from '../../shared/schemas'
import type {
  ActiveSurveysDTO,
  MySurveyResponseDTO,
  SurveyAnswerInput,
  SurveyBlockReason,
  SurveyViewDTO,
} from '../../shared/types'
import {
  findSubmissionOf,
  findSurveyBySlug,
  hasAnswered,
  listMyAnswers,
  listQuestions,
  listVisibleSurveys,
  replaceAnswers,
  saveSubmission,
  toSurveyDTO,
  toSurveyRuleState,
} from '../db/surveys'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, forbidden, notFound } from '../lib/errors'
import { nowIso } from '../lib/http'
import { parseJsonBody } from '../lib/validate'
import { requireAuth, requireFreshPassword } from '../middleware/auth'
import {
  buildSurveyResults,
  normalizarRespuestas,
  syncScheduledSurveys,
} from '../services/surveys'

/**
 * Encuestas desde el lado de quien las responde.
 *
 * Igual que en las votaciones, los permisos se resuelven aqui y viajan ya
 * decididos: el cliente los representa, no los calcula. La diferencia es que
 * ahora hace falta un permiso explicito (`canAnswerSurveys`) que no depende
 * del rol y que se comprueba en cada peticion, no solo al pintar la lista.
 */
export const surveyParticipationRoutes = new Hono<AppEnv>()

surveyParticipationRoutes.use('*', requireAuth, requireFreshPassword)

const MOTIVOS: Record<SurveyBlockReason, { status: number; code: ErrorCode; message: string }> = {
  NO_PERMISSION: {
    status: 403,
    code: ERROR_CODES.SURVEY_PERMISSION_REQUIRED,
    message: 'No tienes permiso para participar en encuestas. Pideselo al administrador.',
  },
  NOT_OPEN: {
    status: 409,
    code: ERROR_CODES.SURVEY_NOT_OPEN,
    message: 'La encuesta todavia no esta abierta',
  },
  NOT_STARTED: {
    status: 409,
    code: ERROR_CODES.SURVEY_NOT_OPEN,
    message: 'La encuesta aun no ha comenzado',
  },
  ENDED: { status: 409, code: ERROR_CODES.SURVEY_NOT_OPEN, message: 'El plazo ha terminado' },
  CLOSED: { status: 409, code: ERROR_CODES.SURVEY_NOT_OPEN, message: 'La encuesta esta cerrada' },
  ARCHIVED: {
    status: 409,
    code: ERROR_CODES.SURVEY_NOT_OPEN,
    message: 'La encuesta esta archivada',
  },
  ALREADY_ANSWERED: {
    status: 409,
    code: ERROR_CODES.SURVEY_ALREADY_ANSWERED,
    message: 'Ya has respondido a esta encuesta',
  },
  USER_INACTIVE: {
    status: 403,
    code: ERROR_CODES.FORBIDDEN,
    message: 'Tu cuenta no esta activa',
  },
}

function errorDeBloqueo(motivo: SurveyBlockReason): AppError {
  const mapeado = MOTIVOS[motivo]
  return new AppError(mapeado.status, mapeado.code, mapeado.message)
}

/** GET /api/me/surveys — las encuestas que esta persona puede ver. */
surveyParticipationRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const ahora = new Date()
  const filas = await listVisibleSurveys(c.env.DB)

  const items = []
  for (const fila of filas) {
    const reglas = toSurveyRuleState(fila)
    if (!isSurveyVisible(reglas, ahora)) continue

    const respondida = await hasAnswered(c.env.DB, fila.id, user.id)
    const evaluacion = evaluateSurvey(
      reglas,
      {
        role: user.role,
        userStatus: user.status,
        canAnswerSurveys: user.canAnswerSurveys,
        hasAnswered: respondida,
      },
      ahora,
    )

    items.push({
      survey: {
        ...toSurveyDTO(fila),
        status: resolveSurveyStatus(reglas, ahora),
        // El numero de respuestas es dato de organizacion: solo para el admin.
        responseCount: canViewAttendanceDetail(user.role) ? fila.response_count : null,
      },
      hasAnswered: respondida,
      canAnswer: evaluacion.canAnswer,
      canChangeAnswer: evaluacion.canChangeAnswer,
      blockReason: evaluacion.blockReason,
    })
  }

  return c.json({ items })
})

/** GET /api/me/surveys/:slug — todo lo que la pantalla necesita, ya resuelto. */
surveyParticipationRoutes.get('/:slug', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const survey = await findSurveyBySlug(c.env.DB, c.req.param('slug'))
  if (!survey) throw notFound('La encuesta no existe')

  const ahora = new Date()
  const reglas = toSurveyRuleState(survey)

  if (!isSurveyVisible(reglas, ahora) && user.role !== 'ADMIN') {
    throw notFound('La encuesta no existe')
  }

  const [preguntas, respondida] = await Promise.all([
    listQuestions(c.env.DB, survey.id),
    hasAnswered(c.env.DB, survey.id, user.id),
  ])

  const evaluacion = evaluateSurvey(
    reglas,
    {
      role: user.role,
      userStatus: user.status,
      canAnswerSurveys: user.canAnswerSurveys,
      hasAnswered: respondida,
    },
    ahora,
  )

  const permiteResultados = canViewSurveyResults(reglas, user.role, ahora)

  /*
   * Las respuestas propias solo se pueden recuperar si la encuesta NO es
   * anonima. En una anonima no es que se oculten: no hay ninguna forma de
   * saber cual de los envios es el tuyo, ni para ti ni para nadie.
   */
  let miRespuesta: MySurveyResponseDTO | null = null
  if (respondida && !toSurveyRuleState(survey).anonymous) {
    const envio = await findSubmissionOf(c.env.DB, survey.id, user.id)
    if (envio) {
      const filas = await listMyAnswers(c.env.DB, envio.id)
      const porPregunta = new Map<string, SurveyAnswerInput>()

      for (const fila of filas) {
        if (fila.option_id !== null) {
          const previa = porPregunta.get(fila.question_id)
          const ids = previa && 'optionIds' in previa ? previa.optionIds : []
          porPregunta.set(fila.question_id, {
            questionId: fila.question_id,
            optionIds: [...ids, fila.option_id],
          })
        } else if (fila.text_value !== null) {
          porPregunta.set(fila.question_id, {
            questionId: fila.question_id,
            text: fila.text_value,
          })
        } else if (fila.scale_value !== null) {
          porPregunta.set(fila.question_id, {
            questionId: fila.question_id,
            scale: fila.scale_value,
          })
        }
      }

      miRespuesta = {
        submittedAt: envio.submitted_at,
        changeCount: envio.change_count,
        answers: [...porPregunta.values()],
      }
    }
  }

  const payload: SurveyViewDTO = {
    survey: {
      ...toSurveyDTO(survey),
      status: resolveSurveyStatus(reglas, ahora),
      responseCount: canViewAttendanceDetail(user.role) ? survey.response_count : null,
    },
    questions: preguntas,
    myResponse: miRespuesta,
    hasAnswered: respondida,
    permissions: {
      canAnswer: evaluacion.canAnswer,
      canChangeAnswer: evaluacion.canChangeAnswer,
      canViewResults: permiteResultados,
      blockReason: evaluacion.blockReason,
    },
    results: permiteResultados
      ? await buildSurveyResults(
          c.env.DB,
          survey,
          preguntas,
          canViewAttendanceDetail(user.role),
        )
      : null,
    serverTime: ahora.toISOString(),
  }

  return c.json(payload)
})

/**
 * POST /api/me/surveys/:slug/respuestas
 *
 * Envia o rehace las respuestas. El permiso, el estado de la encuesta y la
 * coherencia de cada respuesta con su pregunta se comprueban aqui; nada de
 * eso depende de lo que haya hecho el formulario.
 */
surveyParticipationRoutes.post('/:slug/respuestas', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const survey = await findSurveyBySlug(c.env.DB, c.req.param('slug'))
  if (!survey) throw notFound('La encuesta no existe')

  const input = await parseJsonBody(c, submitSurveySchema)
  const reglas = toSurveyRuleState(survey)
  const ahora = new Date()

  const respondida = await hasAnswered(c.env.DB, survey.id, user.id)
  const evaluacion = evaluateSurvey(
    reglas,
    {
      role: user.role,
      userStatus: user.status,
      canAnswerSurveys: user.canAnswerSurveys,
      hasAnswered: respondida,
    },
    ahora,
  )

  if (evaluacion.blockReason) throw errorDeBloqueo(evaluacion.blockReason)

  const preguntas = await listQuestions(c.env.DB, survey.id)
  if (preguntas.length === 0) {
    throw new AppError(
      409,
      ERROR_CODES.SURVEY_HAS_NO_QUESTIONS,
      'Esta encuesta todavia no tiene preguntas',
    )
  }

  const respuestas = normalizarRespuestas(preguntas, input.answers)
  const now = nowIso()

  // Rehacer una respuesta existente: solo en encuestas identificadas, porque
  // en una anonima no hay forma de saber cual es la tuya.
  if (evaluacion.canChangeAnswer) {
    const envio = await findSubmissionOf(c.env.DB, survey.id, user.id)
    if (!envio) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'No encontramos tu respuesta anterior')
    }
    await replaceAnswers(c.env.DB, envio.id, respuestas, now)
    return c.json({ ok: true, changed: true })
  }

  await saveSubmission(c.env.DB, {
    submissionId: newId(),
    surveyId: survey.id,
    participantId: user.id,
    anonymous: reglas.anonymous,
    answers: respuestas,
    now,
  })

  return c.json({ ok: true, changed: false })
})

/**
 * GET /api/me/surveys-abiertas
 *
 * Soporte del enlace fijo `/responder`, el equivalente de `/votar` para las
 * encuestas: el administrador lo reparte una sola vez y siempre lleva a la
 * encuesta abierta en ese momento.
 *
 * Igual que en las votaciones, antes de responder se sincronizan las
 * programadas cuya hora ya llego, para que el enlace funcione en el minuto
 * exacto sin esperar al cron.
 */
surveyParticipationRoutes.get('/abiertas/ahora', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const ahora = new Date()
  await syncScheduledSurveys(c.env.DB, ahora)

  const filas = await listVisibleSurveys(c.env.DB)
  const abiertas: ActiveSurveysDTO['surveys'] = []

  for (const fila of filas) {
    const reglas = toSurveyRuleState(fila)
    if (resolveSurveyStatus(reglas, ahora) !== 'ACTIVE') continue

    abiertas.push({
      id: fila.id,
      slug: fila.slug,
      title: fila.title,
      anonymous: reglas.anonymous,
      questionCount: fila.question_count,
      endsAt: fila.ends_at,
      hasAnswered: await hasAnswered(c.env.DB, fila.id, user.id),
    })
  }

  const payload: ActiveSurveysDTO = {
    surveys: abiertas,
    /** Para poder decir en pantalla por que no se puede responder. */
    canAnswer: user.canAnswerSurveys,
    serverTime: ahora.toISOString(),
  }

  return c.json(payload)
})
