import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  PollDetailDTO,
  PollOptionDTO,
  ResultsDTO,
  VoterPollViewDTO,
} from '../../src/shared/types'
import { call, createUserAndLogin, json, resetDatabase } from '../helpers'

interface PollSetup {
  poll: PollDetailDTO
  options: PollOptionDTO[]
}

/** Crea una Movie Night completa a traves de la API, como haria un administrador. */
async function createPoll(
  adminCookie: string,
  settings: {
    allowVoteChange: boolean
    showLiveResults: boolean
    showResultsAfterClose: boolean
    startsAt?: string | null
    endsAt?: string | null
  },
  titles: string[] = ['Interstellar', 'Origen', 'Gladiator', 'The Batman'],
): Promise<PollSetup> {
  const created = await call('/api/polls', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      title: 'Movie Night — Test',
      description: 'Elige la pelicula del viernes.',
      ...settings,
    },
  })
  expect(created.status).toBe(201)
  const poll = await json<PollDetailDTO>(created)

  const options: PollOptionDTO[] = []
  for (const title of titles) {
    const response = await call('/api/polls/' + poll.id + '/options', {
      method: 'POST',
      cookie: adminCookie,
      body: { title },
    })
    expect(response.status).toBe(201)
    options.push((await json<{ option: PollOptionDTO }>(response)).option)
  }

  return { poll, options }
}

async function publishAndOpen(adminCookie: string, pollId: string): Promise<PollDetailDTO> {
  const published = await call('/api/polls/' + pollId + '/publish', {
    method: 'POST',
    cookie: adminCookie,
  })
  expect(published.status).toBe(200)

  const opened = await call('/api/polls/' + pollId + '/open', {
    method: 'POST',
    cookie: adminCookie,
  })
  expect(opened.status).toBe(200)
  return json<PollDetailDTO>(opened)
}

describe('flujo completo de votacion', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /**
   * Test critico 1 (especificacion 64):
   * voto unico, sin cambios y sin resultados en vivo.
   */
  it('con allowVoteChange=OFF, Carlos vota una vez y no puede votar ni cambiar despues', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01', name: 'Carlos Perez' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: false,
      showLiveResults: false,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)

    const interstellar = options[0] as PollOptionDTO
    const origen = options[1] as PollOptionDTO

    // Carlos ve la votacion y puede votar.
    const before = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie }),
    )
    expect(before.permissions.canVote).toBe(true)
    expect(before.myVote).toBeNull()
    expect(before.results).toBeNull()

    // Vota.
    const voted = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: interstellar.id },
    })
    expect(voted.status).toBe(200)

    // Un segundo intento se rechaza.
    const second = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: origen.id },
    })
    expect(second.status).toBe(409)

    // Y cambiarlo tambien, porque la votacion no lo permite.
    const change = await call('/api/polls/' + poll.id + '/vote', {
      method: 'PATCH',
      cookie: carlos.cookie,
      body: { optionId: origen.id },
    })
    expect(change.status).toBe(409)
    expect((await json<{ error: { code: string } }>(change)).error.code).toBe(
      'VOTE_CHANGE_NOT_ALLOWED',
    )

    // La base de datos guarda exactamente un voto.
    const count = await env.DB.prepare('SELECT COUNT(*) AS value FROM votes WHERE poll_id = ?')
      .bind(poll.id)
      .first<{ value: number }>()
    expect(count?.value).toBe(1)

    // El estado que ve Carlos es coherente con lo anterior.
    const after = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie }),
    )
    expect(after.myVote?.optionId).toBe(interstellar.id)
    expect(after.permissions.canVote).toBe(false)
    expect(after.permissions.canChangeVote).toBe(false)
    expect(after.permissions.blockReason).toBe('ALREADY_VOTED')

    // El administrador si ve la participacion y el recuento.
    const participation = await json<{ participation: { voted: number; eligible: number } }>(
      await call('/api/polls/' + poll.id + '/participation', { cookie: admin.cookie }),
    )
    expect(participation.participation.voted).toBe(1)
    expect(participation.participation.eligible).toBe(2)

    // Y puede cerrarla.
    const closed = await call('/api/polls/' + poll.id + '/close', {
      method: 'POST',
      cookie: admin.cookie,
    })
    expect(closed.status).toBe(200)
    expect((await json<PollDetailDTO>(closed)).status).toBe('CLOSED')
  })

  /**
   * Test critico 2 (especificacion 65):
   * cambio de voto permitido y resultados en vivo.
   */
  it('con allowVoteChange=ON, el cambio actualiza el voto sin crear uno nuevo', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: true,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)

    const interstellar = options[0] as PollOptionDTO
    const origen = options[1] as PollOptionDTO

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: interstellar.id },
    })

    // Con resultados en vivo activados, Carlos si recibe el reparto por
    // pelicula, pero no el bloque de censo y asistencia.
    const live = await call('/api/polls/' + poll.id + '/results', { cookie: carlos.cookie })
    expect(live.status).toBe(200)
    const liveResults = (await json<{ results: ResultsDTO }>(live)).results
    expect(liveResults.overview).toBeNull()
    expect(liveResults.options.find((option) => option.optionId === interstellar.id)?.votes).toBe(1)

    // Cambia su voto.
    const changed = await call('/api/polls/' + poll.id + '/vote', {
      method: 'PATCH',
      cookie: carlos.cookie,
      body: { optionId: origen.id },
    })
    expect(changed.status).toBe(200)

    // Sigue habiendo una unica fila de voto, ahora apuntando a la nueva opcion.
    const rows = await env.DB.prepare(
      'SELECT option_id, change_count FROM votes WHERE poll_id = ?',
    )
      .bind(poll.id)
      .all<{ option_id: string; change_count: number }>()

    expect(rows.results).toHaveLength(1)
    expect(rows.results?.[0]?.option_id).toBe(origen.id)
    expect(rows.results?.[0]?.change_count).toBe(1)

    // Y el recuento refleja el cambio.
    const updated = (
      await json<{ results: ResultsDTO }>(
        await call('/api/polls/' + poll.id + '/results', { cookie: carlos.cookie }),
      )
    ).results
    const origenResult = updated.options.find((option) => option.optionId === origen.id)
    expect(origenResult?.votes).toBe(1)
  })

  /**
   * Test critico 3 (especificacion 66):
   * resultados ocultos durante la votacion y visibles al cerrarla.
   */
  it('con resultados ocultos, el backend no los entrega hasta el cierre', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: false,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)

    await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: (options[0] as PollOptionDTO).id },
    })

    // Durante la votacion: 403, y ni un solo numero en la respuesta.
    const hidden = await call('/api/polls/' + poll.id + '/results', { cookie: carlos.cookie })
    expect(hidden.status).toBe(403)
    const hiddenBody = await hidden.text()
    expect(hiddenBody).toContain('RESULTS_HIDDEN')
    expect(hiddenBody).not.toContain('totalVotes')

    // La vista del trabajador tampoco filtra el recuento global.
    const view = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie }),
    )
    expect(view.results).toBeNull()
    expect(view.poll.totalVotes).toBeNull()

    // El administrador si los ve mientras tanto.
    const adminView = await call('/api/polls/' + poll.id + '/results', { cookie: admin.cookie })
    expect(adminView.status).toBe(200)

    // Al cerrar, Carlos ya puede consultarlos.
    await call('/api/polls/' + poll.id + '/close', { method: 'POST', cookie: admin.cookie })

    const afterClose = await call('/api/polls/' + poll.id + '/results', { cookie: carlos.cookie })
    expect(afterClose.status).toBe(200)
    const closedResults = (await json<{ results: ResultsDTO }>(afterClose)).results
    expect(closedResults.options.reduce((total, option) => total + option.votes, 0)).toBe(1)
  })

  it('no permite votar antes de abrir la votacion', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: false,
      showResultsAfterClose: true,
    })

    // En borrador la votacion ni siquiera existe para el trabajador.
    const draftView = await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie })
    expect(draftView.status).toBe(404)

    await call('/api/polls/' + poll.id + '/publish', { method: 'POST', cookie: admin.cookie })

    // Publicada pero no abierta: visible, pero sin votar.
    const publishedView = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie }),
    )
    expect(publishedView.permissions.canVote).toBe(false)
    expect(publishedView.permissions.blockReason).toBe('NOT_OPEN')

    const attempt = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: (options[0] as PollOptionDTO).id },
    })
    expect(attempt.status).toBe(409)
    expect((await json<{ error: { code: string } }>(attempt)).error.code).toBe('POLL_NOT_OPEN')
  })

  it('no permite votar despues del cierre', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: true,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)
    await call('/api/polls/' + poll.id + '/close', { method: 'POST', cookie: admin.cookie })

    const attempt = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: (options[0] as PollOptionDTO).id },
    })
    expect(attempt.status).toBe(409)
  })

  it('cierra sola una votacion cuya hora de finalizacion ya ha pasado', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const { poll, options } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: true,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)

    // La programacion se manipula directamente para simular el paso del tiempo.
    await env.DB.prepare('UPDATE polls SET ends_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 60_000).toISOString(), poll.id)
      .run()

    const view = await json<VoterPollViewDTO>(
      await call('/api/me/polls/' + poll.slug, { cookie: carlos.cookie }),
    )
    expect(view.poll.status).toBe('CLOSED')
    expect(view.permissions.canVote).toBe(false)

    const attempt = await call('/api/polls/' + poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: (options[0] as PollOptionDTO).id },
    })
    expect(attempt.status).toBe(409)
  })

  it('rechaza votar por una pelicula de otra votacion', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const carlos = await createUserAndLogin({ username: 'carlos01' })

    const first = await createPoll(
      admin.cookie,
      { allowVoteChange: true, showLiveResults: true, showResultsAfterClose: true },
      ['Interstellar'],
    )
    const second = await createPoll(
      admin.cookie,
      { allowVoteChange: true, showLiveResults: true, showResultsAfterClose: true },
      ['Gladiator'],
    )

    await publishAndOpen(admin.cookie, first.poll.id)

    const attempt = await call('/api/polls/' + first.poll.id + '/vote', {
      method: 'POST',
      cookie: carlos.cookie,
      body: { optionId: (second.options[0] as PollOptionDTO).id },
    })
    expect(attempt.status).toBe(404)
  })

  it('no permite abrir una votacion sin peliculas', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

    const created = await call('/api/polls', {
      method: 'POST',
      cookie: admin.cookie,
      body: { title: 'Votacion vacia' },
    })
    const poll = await json<PollDetailDTO>(created)

    const published = await call('/api/polls/' + poll.id + '/publish', {
      method: 'POST',
      cookie: admin.cookie,
    })
    expect(published.status).toBe(409)
    expect((await json<{ error: { code: string } }>(published)).error.code).toBe(
      'POLL_HAS_NO_OPTIONS',
    )
  })

  it('bloquea la cartelera cuando la votacion ya esta abierta', async () => {
    const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
    const { poll } = await createPoll(admin.cookie, {
      allowVoteChange: true,
      showLiveResults: true,
      showResultsAfterClose: true,
    })
    await publishAndOpen(admin.cookie, poll.id)

    const response = await call('/api/polls/' + poll.id + '/options', {
      method: 'POST',
      cookie: admin.cookie,
      body: { title: 'Pelicula tardia' },
    })
    expect(response.status).toBe(409)
  })
})
