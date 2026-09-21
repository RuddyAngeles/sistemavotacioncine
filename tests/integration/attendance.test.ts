import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ParticipationDTO,
  PollDetailDTO,
  ResultsDTO,
  ResultsOverviewDTO,
  VoterPollViewDTO,
} from '../../src/shared/types'
import { call, createUserAndLogin, json, resetDatabase } from '../helpers'

/**
 * Opcion "no asistire" y recuento de entradas.
 *
 * Lo que se comprueba aqui es justo lo que el administrador necesita para
 * comprar las entradas: cuantos van, cuantos no y cuantos faltan por
 * responder, ademas del detalle por persona.
 */
describe('asistencia', () => {
  let adminCookie = ''
  let poll: PollDetailDTO
  let opciones: string[] = []

  async function crearVotacionAbierta(
    settings: Record<string, unknown> = {},
  ): Promise<PollDetailDTO> {
    const created = await call('/api/polls', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: 'Movie Night de asistencia', ...settings },
    })
    const base = await json<PollDetailDTO>(created)

    for (const titulo of ['Interstellar', 'Origen']) {
      await call('/api/polls/' + base.id + '/options', {
        method: 'POST',
        cookie: adminCookie,
        body: { title: titulo },
      })
    }

    await call('/api/polls/' + base.id + '/publish', { method: 'POST', cookie: adminCookie })
    await call('/api/polls/' + base.id + '/open', { method: 'POST', cookie: adminCookie })

    return json<PollDetailDTO>(await call('/api/polls/' + base.id, { cookie: adminCookie }))
  }

  /** Resultados vistos por el admin: siempre traen el bloque de organizacion. */
  async function resultados(): Promise<ResultsDTO & { overview: ResultsOverviewDTO }> {
    const response = await call('/api/polls/' + poll.id + '/results', { cookie: adminCookie })
    expect(response.status).toBe(200)
    const results = (await json<{ results: ResultsDTO }>(response)).results
    expect(results.overview).not.toBeNull()
    return results as ResultsDTO & { overview: ResultsOverviewDTO }
  }

  async function participacion(conElecciones = false): Promise<ParticipationDTO> {
    const response = await call(
      '/api/polls/' + poll.id + '/participation' + (conElecciones ? '?includeChoices=true' : ''),
      { cookie: adminCookie },
    )
    return (await json<{ participation: ParticipationDTO }>(response)).participation
  }

  beforeEach(async () => {
    await resetDatabase()
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN', name: 'Admin' })
    adminCookie = admin.cookie
    poll = await crearVotacionAbierta()
    opciones = poll.options.map((option) => option.id)
  })

  it('la votacion permite "no asistire" por defecto', () => {
    expect(poll.allowNotAttending).toBe(true)
  })

  it('registra un voto de no asistencia sin pelicula asociada', async () => {
    const carlos = await createUserAndLogin({ username: 'carlos01', name: 'Carlos' })

    const response = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { notAttending: true },
    })

    expect(response.status).toBe(200)
    const body = await json<{ vote: { attending: boolean; optionId: string | null } }>(response)
    expect(body.vote.attending).toBe(false)
    expect(body.vote.optionId).toBeNull()

    const row = await env.DB.prepare(
      'SELECT attending, option_id FROM votes WHERE poll_id = ? AND user_id = ?',
    )
      .bind(poll.id, carlos.id)
      .first<{ attending: number; option_id: string | null }>()

    expect(row?.attending).toBe(0)
    expect(row?.option_id).toBeNull()
  })

  it('sigue habiendo un solo voto por persona, elija lo que elija', async () => {
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { notAttending: true },
    })

    const segundo = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: opciones[0] },
    })
    expect(segundo.status).toBe(409)

    const total = await env.DB.prepare('SELECT COUNT(*) AS value FROM votes WHERE poll_id = ?')
      .bind(poll.id)
      .first<{ value: number }>()
    expect(total?.value).toBe(1)
  })

  it('se puede pasar de pelicula a no asistir y al reves, sin duplicar filas', async () => {
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: opciones[0] },
    })

    // Pelicula -> no asistire
    const aNoAsistir = await call('/api/polls/' + poll.id + '/vote', {
      method: 'PATCH',
      cookie: carlos.cookie,
      body: { notAttending: true },
    })
    expect(aNoAsistir.status).toBe(200)
    expect((await resultados()).overview.attendance).toMatchObject({ attending: 0, notAttending: 1 })

    // No asistire -> pelicula
    const aPelicula = await call('/api/polls/' + poll.id + '/vote', {
      method: 'PATCH',
      cookie: carlos.cookie,
      body: { optionId: opciones[1] },
    })
    expect(aPelicula.status).toBe(200)
    expect((await resultados()).overview.attendance).toMatchObject({ attending: 1, notAttending: 0 })

    const filas = await env.DB.prepare(
      'SELECT option_id, attending, change_count FROM votes WHERE poll_id = ?',
    )
      .bind(poll.id)
      .all<{ option_id: string | null; attending: number; change_count: number }>()

    expect(filas.results).toHaveLength(1)
    expect(filas.results?.[0]?.option_id).toBe(opciones[1])
    expect(filas.results?.[0]?.attending).toBe(1)
    expect(filas.results?.[0]?.change_count).toBe(2)
  })

  /** El caso que motiva la funcionalidad: cuantas entradas comprar. */
  it('cuenta asistentes, ausentes y pendientes', async () => {
    const votantes = await Promise.all([
      createUserAndLogin({ username: 'a01', name: 'Ana' }),
      createUserAndLogin({ username: 'b01', name: 'Bruno' }),
      createUserAndLogin({ username: 'c01', name: 'Carla' }),
      createUserAndLogin({ username: 'd01', name: 'Diego' }),
      createUserAndLogin({ username: 'e01', name: 'Elena' }),
    ])

    // Tres asisten (dos a Interstellar, una a Origen), una no asiste,
    // una no responde. Mas el admin, que tampoco responde.
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: votantes[0]!.cookie,
      body: { optionId: opciones[0] },
    })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: votantes[1]!.cookie,
      body: { optionId: opciones[0] },
    })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: votantes[2]!.cookie,
      body: { optionId: opciones[1] },
    })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: votantes[3]!.cookie,
      body: { notAttending: true },
    })

    const results = await resultados()

    // Censo: 5 votantes + el admin = 6.
    expect(results.overview.attendance).toEqual({
      attending: 3,
      notAttending: 1,
      pending: 2,
      eligible: 6,
    })
    expect(results.overview.totalVotes).toBe(4)

    // El reparto por pelicula se calcula entre quienes SI asisten.
    const interstellar = results.options.find((o) => o.optionId === opciones[0])
    const origen = results.options.find((o) => o.optionId === opciones[1])
    expect(interstellar?.votes).toBe(2)
    expect(interstellar?.percentage).toBe(66.7)
    expect(origen?.votes).toBe(1)
    expect(origen?.percentage).toBe(33.3)
  })

  it('los votos de no asistencia no suman a ninguna pelicula', async () => {
    const carlos = await createUserAndLogin({ username: 'carlos01' })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { notAttending: true },
    })

    const results = await resultados()
    expect(results.options.every((option) => option.votes === 0)).toBe(true)
    expect(results.options.every((option) => option.percentage === 0)).toBe(true)
  })

  it('el detalle por persona distingue asiste, no asiste y sin responder', async () => {
    const ana = await createUserAndLogin({ username: 'ana01', name: 'Ana Ruiz' })
    const bruno = await createUserAndLogin({ username: 'bruno01', name: 'Bruno Diaz' })
    await createUserAndLogin({ username: 'carla01', name: 'Carla Sol' })

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: ana.cookie,
      body: { optionId: opciones[0] },
    })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: bruno.cookie,
      body: { notAttending: true },
    })

    const detalle = await participacion(true)

    const filaAna = detalle.users.find((u) => u.username === 'ana01')
    const filaBruno = detalle.users.find((u) => u.username === 'bruno01')
    const filaCarla = detalle.users.find((u) => u.username === 'carla01')

    expect(filaAna).toMatchObject({ name: 'Ana Ruiz', attending: true, choiceTitle: 'Interstellar' })
    expect(filaBruno).toMatchObject({ name: 'Bruno Diaz', attending: false, choiceTitle: null })
    expect(filaCarla).toMatchObject({ name: 'Carla Sol', attending: null, hasVoted: false })

    expect(detalle.attendance).toEqual({
      attending: 1,
      notAttending: 1,
      pending: 2,
      eligible: 4,
    })
  })

  it('quien asiste y quien no se sabe sin desvelar que pelicula eligio cada uno', async () => {
    const ana = await createUserAndLogin({ username: 'ana01', name: 'Ana' })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: ana.cookie,
      body: { optionId: opciones[0] },
    })

    const sinElecciones = await participacion(false)
    const fila = sinElecciones.users.find((u) => u.username === 'ana01')

    // La asistencia es informacion de organizacion y viaja siempre...
    expect(fila?.attending).toBe(true)
    // ...pero la pelicula concreta no, salvo peticion explicita.
    expect(fila?.choiceTitle).toBeUndefined()
    expect(sinElecciones.includesChoices).toBe(false)
  })

  /**
   * Un trabajador ve que pelicula va ganando, y nada mas.
   *
   * El censo, quien no va y cuanta gente falta por responder son datos de
   * organizacion. No basta con no pintarlos: el servidor no los envia, asi
   * que no hay nada que rascar en la respuesta.
   */
  it('a un trabajador con resultados en vivo solo le llega el reparto por pelicula', async () => {
    poll = await crearVotacionAbierta({ showLiveResults: true })
    opciones = poll.options.map((option) => option.id)

    const ana = await createUserAndLogin({ username: 'ana01', name: 'Ana' })
    const bruno = await createUserAndLogin({ username: 'bruno01', name: 'Bruno' })

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: ana.cookie,
      body: { optionId: opciones[0] },
    })
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: bruno.cookie,
      body: { notAttending: true },
    })

    const response = await call('/api/polls/' + poll.id + '/results', { cookie: ana.cookie })
    expect(response.status).toBe(200)

    const crudo = await response.text()
    const vistaAna = (JSON.parse(crudo) as { results: ResultsDTO }).results

    // Lo que si es suyo: el recuento por pelicula.
    expect(vistaAna.options.find((o) => o.optionId === opciones[0])?.votes).toBe(1)

    // Lo que no: ni el bloque ni ninguna de sus cifras en el cuerpo.
    expect(vistaAna.overview).toBeNull()
    for (const campo of ['overview', 'attendance', 'notAttending', 'pending', 'eligible']) {
      expect(crudo).not.toContain('"' + campo + '":{')
    }
    expect(crudo).not.toContain('notAttending')
    expect(crudo).not.toContain('eligibleVoters')

    // El total global tampoco: restandole los votos saldria cuantos no van.
    const vista = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: ana.cookie }),
    )
    expect(vista.results?.overview).toBeNull()
    expect(vista.poll.totalVotes).toBeNull()

    // Y el detalle por persona sigue siendo exclusivo del administrador.
    const detalle = await call('/api/polls/' + poll.id + '/participation', { cookie: ana.cookie })
    expect(detalle.status).toBe(403)

    // El administrador si recibe el bloque completo.
    const vistaAdmin = await resultados()
    expect(vistaAdmin.overview.attendance).toMatchObject({ attending: 1, notAttending: 1 })
  })

  it('rechaza "no asistire" si la votacion no lo permite', async () => {
    const otra = await crearVotacionAbierta({ allowNotAttending: false })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const response = await call('/api/polls/' + otra.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { notAttending: true },
    })

    expect(response.status).toBe(409)
    expect((await json<{ error: { code: string } }>(response)).error.code).toBe(
      'NOT_ATTENDING_DISABLED',
    )
  })

  it('rechaza un cuerpo que mezcle las dos respuestas o no envie ninguna', async () => {
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const vacio = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: {},
    })
    expect(vacio.status).toBe(422)

    const falso = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { notAttending: false },
    })
    expect(falso.status).toBe(422)
  })

  it('la copia de una votacion conserva la configuracion de asistencia', async () => {
    const sinAsistencia = await crearVotacionAbierta({ allowNotAttending: false })

    const copia = await json<PollDetailDTO>(
      await call('/api/polls/' + sinAsistencia.id + '/duplicate', {
        method: 'POST',
        cookie: adminCookie,
        body: {},
      }),
    )

    expect(copia.allowNotAttending).toBe(false)
  })
})
