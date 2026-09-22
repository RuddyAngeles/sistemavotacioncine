import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  SurveyDetailDTO,
  SurveyParticipationDTO,
  SurveyResultsDTO,
  SurveyViewDTO,
} from '../../src/shared/types'
import { call, createUserAndLogin, json, loginOtraVez, resetDatabase } from '../helpers'

/**
 * Modulo de encuestas.
 *
 * Lo que mas se comprueba aqui son las dos promesas que el sistema hace y que
 * no se pueden verificar mirando la pantalla:
 *
 *   1. Sin el permiso `canAnswerSurveys` no se participa, se pida como se pida.
 *   2. En una encuesta anonima no existe ningun camino, ni por la API ni por
 *      SQL directo, que lleve de una persona a su respuesta.
 */
describe('encuestas', () => {
  let adminCookie = ''

  interface Creada {
    survey: SurveyDetailDTO
    preguntas: SurveyDetailDTO['questions']
  }

  /** Crea una encuesta con una pregunta de cada tipo y la deja abierta. */
  async function crearEncuesta(
    settings: Record<string, unknown> = {},
    preguntas: Array<Record<string, unknown>> = [
      { type: 'SINGLE', text: 'Que dia prefieres?', options: [{ text: 'Lunes' }, { text: 'Viernes' }] },
    ],
    abrir = true,
  ): Promise<Creada> {
    const creada = await call('/api/surveys', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: 'Encuesta de prueba', ...settings },
    })
    expect(creada.status).toBe(201)
    let detalle = await json<SurveyDetailDTO>(creada)

    for (const pregunta of preguntas) {
      const respuesta = await call('/api/surveys/' + detalle.id + '/questions', {
        method: 'POST',
        cookie: adminCookie,
        body: pregunta,
      })
      expect(respuesta.status).toBe(201)
      detalle = await json<SurveyDetailDTO>(respuesta)
    }

    if (abrir) {
      await call('/api/surveys/' + detalle.id + '/publish', { method: 'POST', cookie: adminCookie })
      const abierta = await call('/api/surveys/' + detalle.id + '/open', {
        method: 'POST',
        cookie: adminCookie,
      })
      expect(abierta.status).toBe(200)
      detalle = await json<SurveyDetailDTO>(abierta)
    }

    return { survey: detalle, preguntas: detalle.questions }
  }

  beforeEach(async () => {
    await resetDatabase()
    const admin = await createUserAndLogin({
      username: 'admin',
      role: 'ADMIN',
      name: 'Admin',
      canAnswerSurveys: true,
    })
    adminCookie = admin.cookie
  })

  // -------------------------------------------------------------------------
  // El permiso nuevo
  // -------------------------------------------------------------------------

  describe('permiso para participar', () => {
    it('sin permiso no se puede ni ver ni responder una encuesta', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const sinPermiso = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: false })

      const vista = await call('/api/me/surveys/' + survey.slug, { cookie: sinPermiso.cookie })
      expect(vista.status).toBe(200)

      // La encuesta se ve, pero el servidor ya dice que no puede responder.
      const cuerpo = await json<SurveyViewDTO>(vista)
      expect(cuerpo.permissions.canAnswer).toBe(false)
      expect(cuerpo.permissions.blockReason).toBe('NO_PERMISSION')

      // Y si lo intenta de todos modos, 403.
      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: sinPermiso.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })
      expect(intento.status).toBe(403)
      expect((await json<{ error: { code: string } }>(intento)).error.code).toBe(
        'SURVEY_PERMISSION_REQUIRED',
      )

      const total = await env.DB.prepare('SELECT COUNT(*) AS v FROM survey_submissions')
        .first<{ v: number }>()
      expect(total?.v).toBe(0)
    })

    it('con permiso si puede responder', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const conPermiso = await createUserAndLogin({ username: 'bruno01', canAnswerSurveys: true })

      const respuesta = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: conPermiso.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })
      expect(respuesta.status).toBe(200)
    })

    it('el permiso es independiente del rol: un admin sin el tampoco participa', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const otroAdmin = await createUserAndLogin({
        username: 'admin2',
        role: 'ADMIN',
        canAnswerSurveys: false,
      })

      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: otroAdmin.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })
      expect(intento.status).toBe(403)
    })

    it('se puede activar en bloque a todas las cuentas activas', async () => {
      await createUserAndLogin({ username: 'a01', canAnswerSurveys: false })
      await createUserAndLogin({ username: 'b01', canAnswerSurveys: false })
      await createUserAndLogin({ username: 'c01', canAnswerSurveys: true })

      const respuesta = await call('/api/surveys/permissions/bulk', {
        method: 'POST',
        cookie: adminCookie,
        body: { canAnswerSurveys: true },
      })
      expect(respuesta.status).toBe(200)

      // Solo cuenta las que cambiaron de verdad: c01 y el admin ya lo tenian.
      expect((await json<{ updated: number }>(respuesta)).updated).toBe(2)

      const pendientes = await env.DB.prepare(
        "SELECT COUNT(*) AS v FROM users WHERE status = 'ACTIVE' AND can_answer_surveys = 0",
      ).first<{ v: number }>()
      expect(pendientes?.v).toBe(0)
    })

    it('un trabajador no puede darse permiso a si mismo', async () => {
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: false })

      const intento = await call('/api/surveys/permissions/bulk', {
        method: 'POST',
        cookie: ana.cookie,
        body: { canAnswerSurveys: true },
      })
      expect(intento.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // Anonimato
  // -------------------------------------------------------------------------

  describe('encuesta anonima', () => {
    it('el envio se guarda SIN autor, pero la participacion si queda registrada', async () => {
      const { survey, preguntas } = await crearEncuesta({ anonymous: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })

      // El envio existe y no tiene dueno.
      const envio = await env.DB.prepare(
        'SELECT id, user_id, submitted_at FROM survey_submissions WHERE survey_id = ?',
      )
        .bind(survey.id)
        .first<{ id: string; user_id: string | null; submitted_at: string }>()

      expect(envio).not.toBeNull()
      expect(envio?.user_id).toBeNull()

      // La hora va redondeada al dia: no sirve de puente con la participacion.
      expect(envio?.submitted_at).toMatch(/T00:00:00\.000Z$/)

      // La participacion SI sabe quien fue.
      const participacion = await env.DB.prepare(
        'SELECT user_id FROM survey_participants WHERE survey_id = ?',
      )
        .bind(survey.id)
        .first<{ user_id: string }>()
      expect(participacion?.user_id).toBe(ana.id)

      /*
       * Y no hay forma de unir las dos cosas. Esta consulta es la que haria
       * quien quisiera desanonimizar: cruzar participantes con envios. No
       * existe columna por la que unirlas, asi que lo unico que se puede hacer
       * es un producto cartesiano, que no dice nada de nadie.
       */
      const columnas = await env.DB.prepare('PRAGMA table_info(survey_submissions)').all<{
        name: string
      }>()
      const nombres = (columnas.results ?? []).map((c) => c.name)
      expect(nombres).not.toContain('participant_id')
      expect(nombres.filter((n) => n.includes('user'))).toEqual(['user_id'])
    })

    it('no deja cambiar la respuesta aunque se pida al crearla', async () => {
      const { survey } = await crearEncuesta({ anonymous: true, allowResponseChange: true })

      // La peticion pedia las dos cosas; se guarda la unica combinacion posible.
      expect(survey.anonymous).toBe(true)
      expect(survey.allowResponseChange).toBe(false)
    })

    it('el segundo envio de la misma persona se rechaza', async () => {
      const { survey, preguntas } = await crearEncuesta({ anonymous: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const cuerpo = {
        answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }],
      }

      const primero = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: cuerpo,
      })
      expect(primero.status).toBe(200)

      // Desde otra sesion, que es el intento de trampa realista.
      const otroNavegador = await loginOtraVez('ana01')
      const segundo = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: otroNavegador,
        body: cuerpo,
      })
      expect(segundo.status).toBe(409)

      const total = await env.DB.prepare(
        'SELECT COUNT(*) AS v FROM survey_submissions WHERE survey_id = ?',
      )
        .bind(survey.id)
        .first<{ v: number }>()
      expect(total?.v).toBe(1)
    })

    it('ni la propia persona puede recuperar lo que respondio', async () => {
      const { survey, preguntas } = await crearEncuesta({ anonymous: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })

      const vista = await json<SurveyViewDTO>(
        await call('/api/me/surveys/' + survey.slug, { cookie: ana.cookie }),
      )

      // Sabe que ya participo, pero no que dijo: el vinculo no existe.
      expect(vista.hasAnswered).toBe(true)
      expect(vista.myResponse).toBeNull()
    })

    it('el admin ve quien participo y los totales, nunca quien dijo que', async () => {
      const { survey, preguntas } = await crearEncuesta({ anonymous: true })
      const ana = await createUserAndLogin({ username: 'ana01', name: 'Ana', canAnswerSurveys: true })
      await createUserAndLogin({ username: 'bruno01', name: 'Bruno', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[1]!.id] }] },
      })

      const participacion = (
        await json<{ participation: SurveyParticipationDTO }>(
          await call('/api/surveys/' + survey.id + '/participation', { cookie: adminCookie }),
        )
      ).participation

      const filaAna = participacion.users.find((u) => u.username === 'ana01')
      const filaBruno = participacion.users.find((u) => u.username === 'bruno01')
      expect(filaAna?.hasAnswered).toBe(true)
      expect(filaBruno?.hasAnswered).toBe(false)
      // La hora tambien va redondeada aqui.
      expect(filaAna?.answeredAt).toMatch(/T00:00:00\.000Z$/)

      // Ninguna respuesta aparece en el detalle de participacion.
      const crudo = JSON.stringify(participacion)
      expect(crudo).not.toContain(preguntas[0]!.options[1]!.id)

      // Y los resultados son agregados, sin rastro de personas.
      const resultados = (
        await json<{ results: SurveyResultsDTO }>(
          await call('/api/surveys/' + survey.id + '/results', { cookie: adminCookie }),
        )
      ).results

      expect(resultados.submissions).toBe(1)
      expect(JSON.stringify(resultados)).not.toContain(ana.id)
      expect(resultados.questions[0]!.options.find((o) => o.count === 1)?.text).toBe('Viernes')
    })

    it('avisa de que con pocas respuestas el anonimato es debil', async () => {
      const { survey, preguntas } = await crearEncuesta({ anonymous: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })

      const resultados = (
        await json<{ results: SurveyResultsDTO }>(
          await call('/api/surveys/' + survey.id + '/results', { cookie: adminCookie }),
        )
      ).results

      expect(resultados.overview?.anonymityAtRisk).toBe(true)
    })

    it('el anonimato no se puede cambiar una vez publicada', async () => {
      const { survey } = await crearEncuesta({ anonymous: false })

      const intento = await call('/api/surveys/' + survey.id, {
        method: 'PATCH',
        cookie: adminCookie,
        body: { anonymous: true },
      })
      expect(intento.status).toBe(409)
      expect((await json<{ error: { code: string } }>(intento)).error.code).toBe(
        'SURVEY_ANONYMITY_LOCKED',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Encuesta identificada
  // -------------------------------------------------------------------------

  describe('encuesta identificada', () => {
    it('guarda el autor y permite cambiar la respuesta sin duplicar el envio', async () => {
      const { survey, preguntas } = await crearEncuesta({
        anonymous: false,
        allowResponseChange: true,
      })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      const pregunta = preguntas[0]!

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [pregunta.options[0]!.id] }] },
      })

      const cambio = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [pregunta.options[1]!.id] }] },
      })
      expect(cambio.status).toBe(200)

      const envios = await env.DB.prepare(
        'SELECT id, user_id, change_count FROM survey_submissions WHERE survey_id = ?',
      )
        .bind(survey.id)
        .all<{ id: string; user_id: string | null; change_count: number }>()

      expect(envios.results).toHaveLength(1)
      expect(envios.results?.[0]?.user_id).toBe(ana.id)
      expect(envios.results?.[0]?.change_count).toBe(1)

      // Y la respuesta guardada es la nueva, no las dos.
      const respuestas = await env.DB.prepare(
        'SELECT option_id FROM survey_answers WHERE submission_id = ?',
      )
        .bind(envios.results?.[0]?.id ?? '')
        .all<{ option_id: string }>()
      expect(respuestas.results).toHaveLength(1)
      expect(respuestas.results?.[0]?.option_id).toBe(pregunta.options[1]!.id)
    })

    it('la persona puede releer lo que respondio', async () => {
      const { survey, preguntas } = await crearEncuesta({ allowResponseChange: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      const pregunta = preguntas[0]!

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [pregunta.options[1]!.id] }] },
      })

      const vista = await json<SurveyViewDTO>(
        await call('/api/me/surveys/' + survey.slug, { cookie: ana.cookie }),
      )
      expect(vista.myResponse?.answers).toEqual([
        { questionId: pregunta.id, optionIds: [pregunta.options[1]!.id] },
      ])
    })

    it('sin cambio de respuesta, el segundo envio se rechaza', async () => {
      const { survey, preguntas } = await crearEncuesta({ allowResponseChange: false })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      const cuerpo = {
        answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }],
      }

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: cuerpo,
      })
      const segundo = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: cuerpo,
      })
      expect(segundo.status).toBe(409)
    })
  })

  // -------------------------------------------------------------------------
  // Validacion de respuestas
  // -------------------------------------------------------------------------

  describe('las respuestas tienen que encajar con su pregunta', () => {
    async function encuestaCompleta() {
      return crearEncuesta({}, [
        { type: 'SINGLE', text: 'Una sola', options: [{ text: 'A' }, { text: 'B' }] },
        {
          type: 'MULTIPLE',
          text: 'Varias',
          options: [{ text: 'X' }, { text: 'Y' }, { text: 'Z' }],
          maxChoices: 2,
        },
        { type: 'TEXT', text: 'Comentario', required: false },
        { type: 'SCALE', text: 'Del 1 al 10' },
      ])
    }

    it('rechaza responder con texto a una pregunta de opciones', async () => {
      const { survey, preguntas } = await encuestaCompleta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, text: 'A' }] },
      })
      expect(intento.status).toBe(422)
    })

    it('rechaza una opcion que pertenece a otra pregunta', async () => {
      const { survey, preguntas } = await encuestaCompleta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[1]!.options[0]!.id] }],
        },
      })
      expect(intento.status).toBe(422)
    })

    it('respeta el maximo de opciones marcadas', async () => {
      const { survey, preguntas } = await encuestaCompleta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      const multiple = preguntas[1]!

      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [
            { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] },
            { questionId: multiple.id, optionIds: multiple.options.map((o) => o.id) },
            { questionId: preguntas[3]!.id, scale: 5 },
          ],
        },
      })
      expect(intento.status).toBe(422)
      expect((await json<{ error: { message: string } }>(intento)).error.message).toContain(
        'no puedes marcar mas de 2',
      )
    })

    it('rechaza una valoracion fuera del rango', async () => {
      const { survey, preguntas } = await encuestaCompleta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const intento = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[3]!.id, scale: 11 }] },
      })
      // El esquema ya lo corta antes de llegar a la comprobacion de rango.
      expect(intento.status).toBe(422)
    })

    it('exige las preguntas obligatorias y permite saltarse las que no lo son', async () => {
      const { survey, preguntas } = await encuestaCompleta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const incompleta = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })
      expect(incompleta.status).toBe(422)

      // El comentario (no obligatorio) se puede omitir.
      const completa = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [
            { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] },
            { questionId: preguntas[1]!.id, optionIds: [preguntas[1]!.options[0]!.id] },
            { questionId: preguntas[3]!.id, scale: 8 },
          ],
        },
      })
      expect(completa.status).toBe(200)
    })

    it('el recuento agrega bien los cuatro tipos', async () => {
      const { survey, preguntas } = await encuestaCompleta()

      for (const [indice, nombre] of ['ana01', 'bruno01', 'carla01'].entries()) {
        const persona = await createUserAndLogin({ username: nombre, canAnswerSurveys: true })
        await call('/api/me/surveys/' + survey.slug + '/respuestas', {
          method: 'POST',
          cookie: persona.cookie,
          body: {
            answers: [
              { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[indice % 2]!.id] },
              {
                questionId: preguntas[1]!.id,
                optionIds: [preguntas[1]!.options[0]!.id, preguntas[1]!.options[1]!.id],
              },
              { questionId: preguntas[2]!.id, text: 'Comentario ' + indice },
              { questionId: preguntas[3]!.id, scale: indice + 4 },
            ],
          },
        })
      }

      const resultados = (
        await json<{ results: SurveyResultsDTO }>(
          await call('/api/surveys/' + survey.id + '/results', { cookie: adminCookie }),
        )
      ).results

      expect(resultados.submissions).toBe(3)

      // SINGLE: dos para A (indices 0 y 2), una para B.
      const unica = resultados.questions[0]!
      expect(unica.options.find((o) => o.text === 'A')?.count).toBe(2)
      expect(unica.options.find((o) => o.text === 'B')?.count).toBe(1)

      // MULTIPLE: las tres personas marcaron X e Y.
      const multiple = resultados.questions[1]!
      expect(multiple.options.find((o) => o.text === 'X')?.count).toBe(3)
      expect(multiple.options.find((o) => o.text === 'Z')?.count).toBe(0)
      // Contestaron las tres, aunque cada una marcase dos opciones.
      expect(multiple.answered).toBe(3)

      // TEXT: las tres respuestas, sin firmar.
      expect(resultados.questions[2]!.texts).toHaveLength(3)

      // SCALE: media de 4, 5 y 6.
      expect(resultados.questions[3]!.scale?.average).toBe(5)
      expect(resultados.questions[3]!.scale?.distribution.find((d) => d.value === 5)?.count).toBe(1)
      expect(resultados.questions[3]!.scale?.distribution).toHaveLength(10)
    })
  })

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  describe('ciclo de vida', () => {
    it('no deja abrir una encuesta sin preguntas', async () => {
      const creada = await call('/api/surveys', {
        method: 'POST',
        cookie: adminCookie,
        body: { title: 'Encuesta vacia' },
      })
      const survey = await json<SurveyDetailDTO>(creada)

      const intento = await call('/api/surveys/' + survey.id + '/publish', {
        method: 'POST',
        cookie: adminCookie,
      })
      expect(intento.status).toBe(409)
      expect((await json<{ error: { code: string } }>(intento)).error.code).toBe(
        'SURVEY_HAS_NO_QUESTIONS',
      )
    })

    /*
     * Una encuesta abierta SI admite cambios en sus preguntas.
     *
     * Antes se bloqueaban al abrirla, y era una regla mal trasladada desde la
     * cartelera de una votacion: mientras no haya respuestas no hay nada que
     * invalidar, y bloquearla obligaba a rehacer la encuesta entera por una
     * errata. Lo que protege las respuestas es la confirmacion explicita, que
     * se prueba mas abajo.
     */
    it('a una encuesta abierta todavia se le pueden anadir preguntas', async () => {
      const { survey } = await crearEncuesta()

      const intento = await call('/api/surveys/' + survey.id + '/questions', {
        method: 'POST',
        cookie: adminCookie,
        body: { type: 'TEXT', text: 'Una mas' },
      })
      expect(intento.status).toBe(201)
    })

    it('un borrador no es visible para quien participa', async () => {
      const { survey } = await crearEncuesta({}, undefined, false)
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      const vista = await call('/api/me/surveys/' + survey.slug, { cookie: ana.cookie })
      expect(vista.status).toBe(404)
    })

    it('borrar una encuesta con respuestas exige confirmacion', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }] },
      })

      const sinConfirmar = await call('/api/surveys/' + survey.id, {
        method: 'DELETE',
        cookie: adminCookie,
      })
      expect(sinConfirmar.status).toBe(409)
      expect((await json<{ error: { message: string } }>(sinConfirmar)).error.message).toContain(
        'se descartarian 1 respuestas',
      )

      // Sigue ahi tras el rechazo.
      const antes = await env.DB.prepare('SELECT COUNT(*) AS v FROM surveys').first<{ v: number }>()
      expect(antes?.v).toBe(1)

      // Pidiendolo a proposito, se borra con todo lo suyo.
      const confirmado = await call('/api/surveys/' + survey.id + '?descartarRespuestas=true', {
        method: 'DELETE',
        cookie: adminCookie,
      })
      expect(confirmado.status).toBe(204)

      const despues = await env.DB.prepare(
        'SELECT (SELECT COUNT(*) FROM surveys) AS encuestas, (SELECT COUNT(*) FROM survey_submissions) AS envios, (SELECT COUNT(*) FROM survey_answers) AS respuestas',
      ).first<{ encuestas: number; envios: number; respuestas: number }>()
      expect(despues).toEqual({ encuestas: 0, envios: 0, respuestas: 0 })
    })

    it('una encuesta sin respuestas se borra sin mas', async () => {
      const { survey } = await crearEncuesta({}, undefined, false)

      const borrada = await call('/api/surveys/' + survey.id, {
        method: 'DELETE',
        cookie: adminCookie,
      })
      expect(borrada.status).toBe(204)
    })

    /**
     * El caso que reporto el administrador.
     *
     * Crear una encuesta no da derecho a responderla: el permiso va aparte
     * del rol. Es coherente, pero desde el lado de quien la crea parece un
     * error, asi que tiene que poder resolverlo el mismo.
     */
    it('un admin sin permiso no puede responder, pero puede darselo a si mismo', async () => {
      const otroAdmin = await createUserAndLogin({
        username: 'admin3',
        role: 'ADMIN',
        canAnswerSurveys: false,
      })
      const { survey, preguntas } = await crearEncuesta()
      const cuerpo = {
        answers: [{ questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] }],
      }

      const primero = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: otroAdmin.cookie,
        body: cuerpo,
      })
      expect(primero.status).toBe(403)

      // Se lo activa el mismo, que es lo que ofrece la pantalla.
      const permiso = await call('/api/surveys/permissions/bulk', {
        method: 'POST',
        cookie: otroAdmin.cookie,
        body: { canAnswerSurveys: true, userIds: [otroAdmin.id] },
      })
      expect(permiso.status).toBe(200)

      const segundo = await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: otroAdmin.cookie,
        body: cuerpo,
      })
      expect(segundo.status).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // Editar preguntas
  // -------------------------------------------------------------------------

  describe('editar preguntas de una encuesta abierta', () => {
    it('se pueden corregir mientras no haya respuestas', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const pregunta = preguntas[0]!

      const respuesta = await call('/api/surveys/' + survey.id + '/questions/' + pregunta.id, {
        method: 'PUT',
        cookie: adminCookie,
        body: {
          type: 'SINGLE',
          text: 'Que dia prefieres para la reunion?',
          options: pregunta.options.map((o) => ({ id: o.id, text: o.text })),
        },
      })

      expect(respuesta.status).toBe(200)
      const detalle = await json<SurveyDetailDTO>(respuesta)
      expect(detalle.questions[0]!.text).toBe('Que dia prefieres para la reunion?')
    })

    it('corregir el texto de una opcion NO borra las respuestas que la eligieron', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const pregunta = preguntas[0]!
      const elegida = pregunta.options[0]!

      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [elegida.id] }] },
      })

      const correccion = await call('/api/surveys/' + survey.id + '/questions/' + pregunta.id, {
        method: 'PUT',
        cookie: adminCookie,
        body: {
          type: 'SINGLE',
          text: pregunta.text,
          options: pregunta.options.map((o) => ({
            id: o.id,
            text: o.id === elegida.id ? 'Lunes por la manana' : o.text,
          })),
        },
      })
      expect(correccion.status).toBe(200)

      // La respuesta sigue ahi y sigue apuntando a la misma opcion.
      const filas = await env.DB.prepare(
        'SELECT option_id FROM survey_answers WHERE question_id = ?',
      )
        .bind(pregunta.id)
        .all<{ option_id: string }>()

      expect(filas.results).toHaveLength(1)
      expect(filas.results?.[0]?.option_id).toBe(elegida.id)

      // Y el recuento la sigue contando, ya con el texto corregido.
      const resultados = (
        await json<{ results: SurveyResultsDTO }>(
          await call('/api/surveys/' + survey.id + '/results', { cookie: adminCookie }),
        )
      ).results
      expect(resultados.questions[0]!.options.find((o) => o.count === 1)?.text).toBe(
        'Lunes por la manana',
      )
    })

    it('quitar una opcion contestada exige confirmacion explicita', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const pregunta = preguntas[0]!
      const elegida = pregunta.options[0]!

      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [elegida.id] }] },
      })

      const cuerpo = {
        type: 'SINGLE',
        text: pregunta.text,
        // Se quita la opcion que Ana eligio y se anade otra.
        options: [{ id: pregunta.options[1]!.id, text: 'Viernes' }, { text: 'Sabado' }],
      }

      const sinConfirmar = await call(
        '/api/surveys/' + survey.id + '/questions/' + pregunta.id,
        { method: 'PUT', cookie: adminCookie, body: cuerpo },
      )
      expect(sinConfirmar.status).toBe(409)
      expect((await json<{ error: { message: string } }>(sinConfirmar)).error.message).toContain(
        'se descartarian 1 respuestas',
      )

      // La respuesta sigue intacta tras el rechazo.
      const antes = await env.DB.prepare('SELECT COUNT(*) AS v FROM survey_answers').first<{ v: number }>()
      expect(antes?.v).toBe(1)

      // Pidiendolo a proposito, si se hace.
      const confirmado = await call(
        '/api/surveys/' + survey.id + '/questions/' + pregunta.id + '?descartarRespuestas=true',
        { method: 'PUT', cookie: adminCookie, body: cuerpo },
      )
      expect(confirmado.status).toBe(200)

      const despues = await env.DB.prepare('SELECT COUNT(*) AS v FROM survey_answers').first<{ v: number }>()
      expect(despues?.v).toBe(0)
    })

    it('eliminar una pregunta contestada tambien exige confirmacion', async () => {
      const { survey, preguntas } = await crearEncuesta()
      const pregunta = preguntas[0]!

      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: { answers: [{ questionId: pregunta.id, optionIds: [pregunta.options[0]!.id] }] },
      })

      const sinConfirmar = await call(
        '/api/surveys/' + survey.id + '/questions/' + pregunta.id,
        { method: 'DELETE', cookie: adminCookie },
      )
      expect(sinConfirmar.status).toBe(409)

      const confirmado = await call(
        '/api/surveys/' + survey.id + '/questions/' + pregunta.id + '?descartarRespuestas=true',
        { method: 'DELETE', cookie: adminCookie },
      )
      expect(confirmado.status).toBe(200)
    })

    it('una encuesta cerrada si mantiene las preguntas bloqueadas', async () => {
      const { survey, preguntas } = await crearEncuesta()
      await call('/api/surveys/' + survey.id + '/close', { method: 'POST', cookie: adminCookie })

      const intento = await call('/api/surveys/' + survey.id + '/questions/' + preguntas[0]!.id, {
        method: 'PUT',
        cookie: adminCookie,
        body: { type: 'SINGLE', text: 'Otra cosa', options: preguntas[0]!.options.map((o) => ({ id: o.id, text: o.text })) },
      })
      expect(intento.status).toBe(409)
    })
  })

  // -------------------------------------------------------------------------
  // Que ve un participante de lo que responden los demas
  // -------------------------------------------------------------------------

  describe('lo que responde cada quien no se ensena a los demas', () => {
    async function conTexto(ajustes: Record<string, unknown>) {
      return crearEncuesta(ajustes, [
        { type: 'SINGLE', text: 'Ambiente?', options: [{ text: 'Bien' }, { text: 'Mal' }] },
        { type: 'TEXT', text: 'Comentarios', required: false },
      ])
    }

    const SECRETO = 'ESTO-LO-ESCRIBIO-ANA-Y-NADIE-MAS-DEBE-LEERLO'

    /**
     * El caso que motiva la regla.
     *
     * Un recuento por opcion es una estadistica y se puede compartir. Un
     * comentario escrito es la respuesta individual de alguien reproducida
     * tal cual: aunque no lleve firma, ensenarselo a la plantilla es ensenar
     * lo que respondio otro.
     */
    it('los comentarios escritos no llegan a los demas participantes', async () => {
      const { survey, preguntas } = await conTexto({ showLiveResults: true })
      const ana = await createUserAndLogin({ username: 'ana01', name: 'Ana', canAnswerSurveys: true })
      const bruno = await createUserAndLogin({ username: 'bruno01', name: 'Bruno', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [
            { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] },
            { questionId: preguntas[1]!.id, text: SECRETO },
          ],
        },
      })

      // Bruno mira la encuesta con los resultados en vivo activados.
      const respuesta = await call('/api/me/surveys/' + survey.slug, { cookie: bruno.cookie })
      const crudo = await respuesta.text()
      const vista = JSON.parse(crudo) as SurveyViewDTO

      // Ve el recuento...
      expect(vista.results).not.toBeNull()
      expect(vista.results!.questions[0]!.options.find((o) => o.text === 'Bien')?.count).toBe(1)

      // ...pero el comentario no viaja, ni el nombre de quien lo escribio.
      expect(crudo).not.toContain(SECRETO)
      expect(crudo).not.toContain('Ana')
      expect(vista.results!.questions[1]!.texts).toEqual([])

      // Si sabe que hay uno, que no revela cual.
      expect(vista.results!.questions[1]!.textCount).toBe(1)
    })

    it('el administrador si los lee', async () => {
      const { survey, preguntas } = await conTexto({ showLiveResults: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [
            { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] },
            { questionId: preguntas[1]!.id, text: SECRETO },
          ],
        },
      })

      const resultados = (
        await json<{ results: SurveyResultsDTO }>(
          await call('/api/surveys/' + survey.id + '/results', { cookie: adminCookie }),
        )
      ).results

      expect(resultados.questions[1]!.texts).toEqual([SECRETO])
    })

    it('tampoco al cerrarse, que es cuando se comparten los resultados', async () => {
      const { survey, preguntas } = await conTexto({ showResultsAfterClose: true })
      const ana = await createUserAndLogin({ username: 'ana01', canAnswerSurveys: true })
      const bruno = await createUserAndLogin({ username: 'bruno01', canAnswerSurveys: true })

      await call('/api/me/surveys/' + survey.slug + '/respuestas', {
        method: 'POST',
        cookie: ana.cookie,
        body: {
          answers: [
            { questionId: preguntas[0]!.id, optionIds: [preguntas[0]!.options[0]!.id] },
            { questionId: preguntas[1]!.id, text: SECRETO },
          ],
        },
      })
      await call('/api/surveys/' + survey.id + '/close', { method: 'POST', cookie: adminCookie })

      const crudo = await (
        await call('/api/me/surveys/' + survey.slug, { cookie: bruno.cookie })
      ).text()

      expect(crudo).not.toContain(SECRETO)
    })

    it('un participante no alcanza ninguna ruta de administracion de la encuesta', async () => {
      const { survey } = await conTexto({})
      const bruno = await createUserAndLogin({ username: 'bruno01', canAnswerSurveys: true })

      for (const ruta of ['', '/results', '/participation']) {
        const r = await call('/api/surveys/' + survey.id + ruta, { cookie: bruno.cookie })
        expect(r.status).toBe(403)
      }
    })
  })
})
