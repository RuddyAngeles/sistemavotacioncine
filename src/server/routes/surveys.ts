import { Hono } from 'hono'
import type { Context } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES, type AuditAction } from '../../shared/constants'
import {
  areQuestionsEditable,
  canTransition,
  canViewAttendanceDetail,
  isAnonymityEditable,
  isPollEditable,
  resolveSurveyStatus,
  targetStatus,
  type PollTransition,
} from '../../shared/policy'
import {
  bulkSurveyPermissionSchema,
  createQuestionSchema,
  createSurveySchema,
  descartarRespuestasSchema,
  listSurveysQuerySchema,
  reorderQuestionsSchema,
  updateSurveySchema,
} from '../../shared/schemas'
import type { PollStatus, SurveyDetailDTO } from '../../shared/types'
import { bool } from '../db/client'
import {
  countAnswersForOptions,
  countAnswersForQuestion,
  countEligible,
  deleteQuestion,
  deleteSurvey,
  findQuestion,
  findSurvey,
  insertQuestion,
  insertSurvey,
  listOptionIds,
  listQuestions,
  listSurveys,
  nextQuestionPosition,
  reorderQuestions,
  replaceQuestion,
  slugExists,
  toSurveyDTO,
  updateSurvey,
  type SurveyRow,
} from '../db/surveys'
import { setSurveyPermission, setSurveyPermissionForAll } from '../db/users'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, forbidden, notFound } from '../lib/errors'
import { nowIso } from '../lib/http'
import { uniqueSlug } from '../lib/slug'
import { parseJsonBody, parseQuery } from '../lib/validate'
import { requireAdmin } from '../middleware/auth'
import { recordAudit } from '../services/audit'
import { buildSurveyParticipation, buildSurveyResults } from '../services/surveys'

/**
 * Administracion de encuestas. Todo aqui exige rol ADMIN.
 *
 * Lo que responde el trabajador vive en `survey-participation.ts`: estan
 * separadas porque los permisos son distintos y mezclarlas haria facil que
 * una ruta de gestion acabase siendo accesible sin querer.
 */
export const surveyRoutes = new Hono<AppEnv>()

surveyRoutes.use('*', requireAdmin)

async function cargar(db: D1Database, id: string): Promise<SurveyRow> {
  const survey = await findSurvey(db, id)
  if (!survey) throw notFound('La encuesta no existe')
  return survey
}

/** Bloquea los cambios que ya no son reversibles sin falsear los resultados. */
function exigirEditable(survey: SurveyRow): void {
  if (!isPollEditable(survey.status)) {
    throw new AppError(409, ERROR_CODES.CONFLICT, 'Una encuesta cerrada ya no se puede editar')
  }
}

/**
 * Una encuesta abierta SI admite cambios en sus preguntas.
 *
 * Lo que los hace peligrosos no es que este abierta, sino que ya haya
 * respuestas, y de eso se encarga "exigirConfirmacion" en cada caso
 * concreto. Aqui solo se cierra lo que ya esta cerrado.
 */
function exigirPreguntasEditables(survey: SurveyRow): void {
  if (!areQuestionsEditable(survey.status)) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      'La encuesta esta cerrada: sus resultados ya se han dado por buenos',
    )
  }
}

/**
 * Corta un cambio que borraria respuestas, salvo que se pida a proposito.
 *
 * El cuerpo de la peticion puede traer "descartarRespuestas: true". Sin eso,
 * se responde 409 diciendo cuantas se perderian, para que la interfaz pueda
 * preguntar antes de hacerlo.
 */
function exigirConfirmacion(afectadas: number, descartar: boolean, que: string): void {
  if (afectadas === 0 || descartar) return
  throw new AppError(
    409,
    ERROR_CODES.CONFLICT,
    'Al ' + que + ' se descartarian ' + afectadas + ' respuestas ya recibidas',
  )
}

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------

surveyRoutes.get('/', async (c) => {
  const query = parseQuery(c, listSurveysQuerySchema)
  const { rows, total } = await listSurveys(c.env.DB, {
    status: query.status,
    search: query.search,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return c.json({
    items: rows.map(toSurveyDTO),
    total,
    page: query.page,
    pageSize: query.pageSize,
  })
})

surveyRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const input = await parseJsonBody(c, createSurveySchema)
  const now = nowIso()
  const id = newId()
  const slug = await uniqueSlug(input.title, (candidato) => slugExists(c.env.DB, candidato))

  await insertSurvey(c.env.DB, {
    id,
    slug,
    title: input.title,
    description: input.description,
    anonymous: input.anonymous,
    allowResponseChange: input.allowResponseChange,
    showLiveResults: input.showLiveResults,
    showResultsAfterClose: input.showResultsAfterClose,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdBy: user.id,
    now,
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_CREATED,
    entity: 'survey',
    entityId: id,
    metadata: { title: input.title, anonima: input.anonymous },
  })

  const survey = await cargar(c.env.DB, id)
  return c.json(await conDetalle(c.env.DB, survey), 201)
})

async function conDetalle(db: D1Database, survey: SurveyRow): Promise<SurveyDetailDTO> {
  const [questions, eligibleCount] = await Promise.all([
    listQuestions(db, survey.id),
    countEligible(db),
  ])
  return { ...toSurveyDTO(survey), questions, eligibleCount }
}

surveyRoutes.get('/:id', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  return c.json(await conDetalle(c.env.DB, survey))
})

surveyRoutes.patch('/:id', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  exigirEditable(survey)

  const input = await parseJsonBody(c, updateSurveySchema)

  /*
   * El anonimato solo se toca en borrador. Cambiarlo despues no reescribiria
   * lo ya guardado: las respuestas identificadas seguirian teniendo su autor,
   * y al reves se prometeria una identificacion que ya no existe.
   */
  if (input.anonymous !== undefined && input.anonymous !== (survey.anonymous === 1)) {
    if (!isAnonymityEditable(survey.status)) {
      throw new AppError(
        409,
        ERROR_CODES.SURVEY_ANONYMITY_LOCKED,
        'El anonimato solo se puede cambiar mientras la encuesta sea un borrador',
      )
    }
  }

  const anonimaFinal = input.anonymous ?? survey.anonymous === 1

  await updateSurvey(c.env.DB, survey.id, {
    title: input.title,
    description: input.description,
    anonymous: input.anonymous === undefined ? undefined : bool(input.anonymous),
    // Una anonima nunca admite cambio de respuesta, se pida lo que se pida.
    allow_response_change:
      anonimaFinal
        ? 0
        : input.allowResponseChange === undefined
          ? undefined
          : bool(input.allowResponseChange),
    show_live_results:
      input.showLiveResults === undefined ? undefined : bool(input.showLiveResults),
    show_results_after_close:
      input.showResultsAfterClose === undefined ? undefined : bool(input.showResultsAfterClose),
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    updated_at: nowIso(),
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_UPDATED,
    entity: 'survey',
    entityId: survey.id,
    metadata: { title: input.title ?? survey.title },
  })

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)))
})

surveyRoutes.delete('/:id', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))

  /*
   * Borrar una encuesta con respuestas se las lleva todas. No se impide (es
   * la encuesta del administrador), pero hay que pedirlo a proposito: sin
   * la confirmacion se responde 409 diciendo cuantas se perderian, para que
   * la pantalla pueda ofrecer archivarla en su lugar.
   */
  const { descartarRespuestas } = parseQuery(c, descartarRespuestasSchema)
  exigirConfirmacion(survey.response_count, descartarRespuestas, 'eliminar la encuesta')

  await deleteSurvey(c.env.DB, survey.id)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_DELETED,
    entity: 'survey',
    entityId: survey.id,
    metadata: { title: survey.title },
  })

  return c.body(null, 204)
})

// ---------------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------------

const AUDITORIA_TRANSICION: Record<PollTransition, AuditAction> = {
  publish: AUDIT_ACTIONS.SURVEY_PUBLISHED,
  open: AUDIT_ACTIONS.SURVEY_OPENED,
  close: AUDIT_ACTIONS.SURVEY_CLOSED,
  archive: AUDIT_ACTIONS.SURVEY_ARCHIVED,
  reopen: AUDIT_ACTIONS.SURVEY_REOPENED,
  'back-to-draft': AUDIT_ACTIONS.SURVEY_UPDATED,
}

const SELLO: Partial<Record<PollStatus, string>> = {
  PUBLISHED: 'published_at',
  ACTIVE: 'opened_at',
  CLOSED: 'closed_at',
  ARCHIVED: 'archived_at',
}

async function transicionar(c: Context<AppEnv>, transicion: PollTransition) {
  const survey = await cargar(c.env.DB, c.req.param('id') ?? '')

  if (!canTransition(survey.status, transicion)) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'No se puede pasar de ' + survey.status + ' con la accion "' + transicion + '"',
    )
  }

  // Abrir una encuesta sin preguntas no tiene sentido y deja a la gente ante
  // una pantalla vacia: se impide aqui, no en el formulario.
  if ((transicion === 'publish' || transicion === 'open') && survey.question_count === 0) {
    throw new AppError(
      409,
      ERROR_CODES.SURVEY_HAS_NO_QUESTIONS,
      'Anade al menos una pregunta antes de publicar la encuesta',
    )
  }

  const destino = targetStatus(transicion)
  const now = nowIso()
  const sello = SELLO[destino]

  await updateSurvey(c.env.DB, survey.id, {
    status: destino,
    updated_at: now,
    ...(sello ? { [sello]: now } : {}),
  })

  await recordAudit(c, {
    action: AUDITORIA_TRANSICION[transicion],
    entity: 'survey',
    entityId: survey.id,
    metadata: { de: survey.status, a: destino },
  })

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)))
}

surveyRoutes.post('/:id/publish', (c) => transicionar(c, 'publish'))
surveyRoutes.post('/:id/open', (c) => transicionar(c, 'open'))
surveyRoutes.post('/:id/close', (c) => transicionar(c, 'close'))
surveyRoutes.post('/:id/archive', (c) => transicionar(c, 'archive'))
surveyRoutes.post('/:id/reopen', (c) => transicionar(c, 'reopen'))

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

surveyRoutes.post('/:id/questions', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  exigirPreguntasEditables(survey)

  const input = await parseJsonBody(c, createQuestionSchema)
  const now = nowIso()
  const id = newId()

  await insertQuestion(c.env.DB, {
    id,
    surveyId: survey.id,
    position: await nextQuestionPosition(c.env.DB, survey.id),
    type: input.type,
    text: input.text,
    help: input.help,
    required: input.required,
    minChoices: input.minChoices,
    maxChoices: input.maxChoices,
    scaleMinLabel: input.scaleMinLabel,
    scaleMaxLabel: input.scaleMaxLabel,
    opciones: input.options.map((opcion) => ({ id: newId(), text: opcion.text })),
    now,
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_QUESTION_CREATED,
    entity: 'survey_question',
    entityId: id,
    metadata: { surveyId: survey.id, tipo: input.type },
  })

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)), 201)
})

surveyRoutes.put('/:id/questions/:questionId', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  exigirPreguntasEditables(survey)

  const pregunta = await findQuestion(c.env.DB, survey.id, c.req.param('questionId'))
  if (!pregunta) throw notFound('La pregunta no existe')

  const input = await parseJsonBody(c, createQuestionSchema)
  const { descartarRespuestas } = await parseQuery(c, descartarRespuestasSchema)

  /*
   * Las opciones que llegan con id son las que ya existian. Corregirles el
   * texto no toca las respuestas. Las que faltan son las que el
   * administrador ha quitado, y esas SI se llevarian sus respuestas por
   * delante: se cuenta cuantas antes de hacer nada.
   */
  const recibidas = new Set(
    input.options.map((opcion) => opcion.id).filter((id): id is string => Boolean(id)),
  )
  const actuales = await listOptionIds(c.env.DB, pregunta.id)
  const aEliminar = actuales.filter((fila) => !recibidas.has(fila.id)).map((fila) => fila.id)

  // Cambiar el tipo de pregunta invalida cualquier respuesta anterior.
  const cambiaElTipo = input.type !== pregunta.type
  const afectadas = cambiaElTipo
    ? await countAnswersForQuestion(c.env.DB, pregunta.id)
    : await countAnswersForOptions(c.env.DB, aEliminar)

  exigirConfirmacion(
    afectadas,
    descartarRespuestas,
    cambiaElTipo ? 'cambiar el tipo de pregunta' : 'quitar esas opciones',
  )

  await replaceQuestion(c.env.DB, {
    id: pregunta.id,
    surveyId: survey.id,
    position: pregunta.position,
    type: input.type,
    text: input.text,
    help: input.help,
    required: input.required,
    minChoices: input.minChoices,
    maxChoices: input.maxChoices,
    scaleMinLabel: input.scaleMinLabel,
    scaleMaxLabel: input.scaleMaxLabel,
    // Se conserva el id de las que ya existian; las nuevas reciben uno.
    opciones: input.options.map((opcion) => ({ id: opcion.id ?? newId(), text: opcion.text })),
    now: nowIso(),
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_QUESTION_UPDATED,
    entity: 'survey_question',
    entityId: pregunta.id,
    metadata: { surveyId: survey.id },
  })

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)))
})

surveyRoutes.delete('/:id/questions/:questionId', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  exigirPreguntasEditables(survey)

  const pregunta = await findQuestion(c.env.DB, survey.id, c.req.param('questionId'))
  if (!pregunta) throw notFound('La pregunta no existe')

  // Eliminar una pregunta se lleva todas sus respuestas.
  const { descartarRespuestas } = await parseQuery(c, descartarRespuestasSchema)
  const afectadas = await countAnswersForQuestion(c.env.DB, pregunta.id)
  exigirConfirmacion(afectadas, descartarRespuestas, 'eliminar la pregunta')

  await deleteQuestion(c.env.DB, survey.id, pregunta.id)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_QUESTION_DELETED,
    entity: 'survey_question',
    entityId: pregunta.id,
    metadata: { surveyId: survey.id },
  })

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)))
})

surveyRoutes.post('/:id/questions/reorder', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  exigirPreguntasEditables(survey)

  const input = await parseJsonBody(c, reorderQuestionsSchema)
  await reorderQuestions(c.env.DB, survey.id, input.questionIds, nowIso())

  return c.json(await conDetalle(c.env.DB, await cargar(c.env.DB, survey.id)))
})

// ---------------------------------------------------------------------------
// Resultados y participacion
// ---------------------------------------------------------------------------

surveyRoutes.get('/:id/results', async (c) => {
  const user = c.get('user')
  if (!user) throw forbidden()

  const survey = await cargar(c.env.DB, c.req.param('id'))
  const preguntas = await listQuestions(c.env.DB, survey.id)

  return c.json({
    results: await buildSurveyResults(
      c.env.DB,
      survey,
      preguntas,
      canViewAttendanceDetail(user.role),
    ),
  })
})

/**
 * GET /api/surveys/:id/participation
 *
 * Quien ha respondido y quien no. Funciona igual en las anonimas, porque sale
 * de la tabla de participacion: no existe ninguna consulta que lleve de aqui
 * a una respuesta.
 */
surveyRoutes.get('/:id/participation', async (c) => {
  const survey = await cargar(c.env.DB, c.req.param('id'))
  return c.json({ participation: await buildSurveyParticipation(c.env.DB, survey) })
})

// ---------------------------------------------------------------------------
// Permiso de participacion
// ---------------------------------------------------------------------------

/**
 * POST /api/surveys/permissions/bulk
 *
 * Activa o quita el permiso a varias cuentas de una vez. Existe porque el
 * permiso nace apagado: sin esto, habilitar a la plantilla entera obligaria a
 * entrar cuenta por cuenta.
 */
surveyRoutes.post('/permissions/bulk', async (c) => {
  const input = await parseJsonBody(c, bulkSurveyPermissionSchema)
  const now = nowIso()

  const afectadas = input.userIds
    ? await setSurveyPermission(c.env.DB, input.userIds, input.canAnswerSurveys, now)
    : await setSurveyPermissionForAll(c.env.DB, input.canAnswerSurveys, now)

  await recordAudit(c, {
    action: AUDIT_ACTIONS.SURVEY_PERMISSION_BULK,
    entity: 'user',
    metadata: {
      permiso: input.canAnswerSurveys ? 'activado' : 'retirado',
      cuentas: afectadas,
      alcance: input.userIds ? 'seleccion' : 'todas las activas',
    },
  })

  return c.json({ updated: afectadas })
})

export { resolveSurveyStatus }
