import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivePollsDTO, PollDetailDTO } from '../../src/shared/types'
import { call, createUserAndLogin, json, resetDatabase } from '../helpers'

/**
 * Enlace fijo (`/votar`, respaldado por GET /api/me/active-poll).
 *
 * Es la unica direccion que se reparte a los trabajadores, asi que tiene que
 * acertar siempre con la votacion abierta en ese momento.
 */
describe('enlace fijo a la votacion activa', () => {
  let adminCookie = ''
  let voterCookie = ''

  async function crearVotacion(titulo: string): Promise<PollDetailDTO> {
    const created = await call('/api/polls', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: titulo },
    })
    const poll = await json<PollDetailDTO>(created)

    await call('/api/polls/' + poll.id + '/options', {
      method: 'POST',
      cookie: adminCookie,
      body: { title: 'Interstellar' },
    })
    return poll
  }

  async function abrir(pollId: string): Promise<void> {
    await call('/api/polls/' + pollId + '/publish', { method: 'POST', cookie: adminCookie })
    await call('/api/polls/' + pollId + '/open', { method: 'POST', cookie: adminCookie })
  }

  async function activas(cookie: string): Promise<ActivePollsDTO> {
    const response = await call('/api/me/active-poll', { cookie })
    expect(response.status).toBe(200)
    return json<ActivePollsDTO>(response)
  }

  beforeEach(async () => {
    await resetDatabase()
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const voter = await createUserAndLogin({ username: 'carlos01' })
    adminCookie = admin.cookie
    voterCookie = voter.cookie
  })

  it('sin sesion responde 401, igual que el resto', async () => {
    const response = await call('/api/me/active-poll')
    expect(response.status).toBe(401)
  })

  it('devuelve lista vacia cuando no hay ninguna abierta', async () => {
    await crearVotacion('Borrador sin abrir')
    const result = await activas(voterCookie)
    expect(result.polls).toHaveLength(0)
  })

  it('ignora borradores y votaciones solo publicadas', async () => {
    const poll = await crearVotacion('Publicada pero cerrada al voto')
    await call('/api/polls/' + poll.id + '/publish', { method: 'POST', cookie: adminCookie })

    const result = await activas(voterCookie)
    expect(result.polls).toHaveLength(0)
  })

  it('devuelve la votacion en cuanto el administrador la abre', async () => {
    const poll = await crearVotacion('Movie Night de septiembre')
    await abrir(poll.id)

    const result = await activas(voterCookie)
    expect(result.polls).toHaveLength(1)
    expect(result.polls[0]?.slug).toBe(poll.slug)
    expect(result.polls[0]?.hasVoted).toBe(false)
  })

  it('deja de devolverla en cuanto se cierra', async () => {
    const poll = await crearVotacion('Movie Night que termina')
    await abrir(poll.id)
    expect((await activas(voterCookie)).polls).toHaveLength(1)

    await call('/api/polls/' + poll.id + '/close', { method: 'POST', cookie: adminCookie })
    expect((await activas(voterCookie)).polls).toHaveLength(0)
  })

  it('indica si el trabajador ya ha votado en ella', async () => {
    const poll = await crearVotacion('Movie Night con voto')
    await abrir(poll.id)

    const detail = await json<PollDetailDTO>(
      await call('/api/polls/' + poll.id, { cookie: adminCookie }),
    )
    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: voterCookie,
      body: { optionId: detail.options[0]?.id },
    })

    const result = await activas(voterCookie)
    expect(result.polls[0]?.hasVoted).toBe(true)

    // Para otro usuario sigue pendiente: el dato es por persona.
    const otro = await createUserAndLogin({ username: 'maria01' })
    expect((await activas(otro.cookie)).polls[0]?.hasVoted).toBe(false)
  })

  /**
   * El caso que hace util el enlace: una votacion programada cuya hora ya
   * llego debe aparecer al instante, sin esperar al cron de cada 5 minutos.
   */
  it('abre sola una votacion programada cuya hora ya paso', async () => {
    const poll = await crearVotacion('Movie Night programada')

    const startsAt = new Date(Date.now() - 60_000).toISOString()
    await env.DB.prepare("UPDATE polls SET status = 'SCHEDULED', starts_at = ? WHERE id = ?")
      .bind(startsAt, poll.id)
      .run()

    const result = await activas(voterCookie)
    expect(result.polls).toHaveLength(1)
    expect(result.polls[0]?.slug).toBe(poll.slug)

    // Y el cambio de estado queda persistido, no solo calculado al vuelo.
    const row = await env.DB.prepare('SELECT status FROM polls WHERE id = ?')
      .bind(poll.id)
      .first<{ status: string }>()
    expect(row?.status).toBe('ACTIVE')
  })

  it('no abre una programada cuya hora todavia no ha llegado', async () => {
    const poll = await crearVotacion('Movie Night del viernes')

    const startsAt = new Date(Date.now() + 3_600_000).toISOString()
    await env.DB.prepare("UPDATE polls SET status = 'SCHEDULED', starts_at = ? WHERE id = ?")
      .bind(startsAt, poll.id)
      .run()

    expect((await activas(voterCookie)).polls).toHaveLength(0)
  })

  it('devuelve varias cuando hay mas de una abierta', async () => {
    const primera = await crearVotacion('Primera')
    const segunda = await crearVotacion('Segunda')
    await abrir(primera.id)
    await abrir(segunda.id)

    const result = await activas(voterCookie)
    expect(result.polls).toHaveLength(2)
    expect(result.polls.map((poll) => poll.slug).sort()).toEqual(
      [primera.slug, segunda.slug].sort(),
    )
  })

  it('no filtra nada que el trabajador no deba ver', async () => {
    const poll = await crearVotacion('Movie Night discreta')
    await abrir(poll.id)

    const body = await call('/api/me/active-poll', { cookie: voterCookie }).then((r) => r.text())
    // Solo lo imprescindible para redirigir: ni recuentos ni configuracion.
    expect(body).not.toContain('totalVotes')
    expect(body).not.toContain('showLiveResults')
  })
})
