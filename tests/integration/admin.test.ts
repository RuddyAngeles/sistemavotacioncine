import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PaginatedDTO, PollDetailDTO, UserDTO } from '../../src/shared/types'
import { call, createUser, createUserAndLogin, json, resetDatabase } from '../helpers'

describe('administracion', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  describe('autorizacion', () => {
    it('un trabajador no puede acceder a ninguna ruta de administracion', async () => {
      const voter = await createUserAndLogin({ username: 'carlos01' })

      const routes: Array<[string, string]> = [
        ['GET', '/api/users'],
        ['POST', '/api/users'],
        ['GET', '/api/polls'],
        ['POST', '/api/polls'],
        ['GET', '/api/dashboard/stats'],
        ['GET', '/api/audit-logs'],
      ]

      for (const [method, path] of routes) {
        const response = await call(path, {
          method,
          cookie: voter.cookie,
          ...(method === 'POST' ? { body: {} } : {}),
        })
        expect(response.status, method + ' ' + path).toBe(403)
      }
    })

    it('sin sesion, las rutas privadas responden 401 aunque se conozca la URL', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night — Privada' },
      })
      const poll = await json<PollDetailDTO>(created)

      for (const path of [
        '/api/users',
        '/api/polls',
        '/api/polls/' + poll.id,
        '/api/me/polls',
        '/api/me/polls/' + poll.slug,
        '/api/polls/' + poll.id + '/results',
        '/api/dashboard/stats',
      ]) {
        const response = await call(path)
        expect(response.status, path).toBe(401)
      }
    })

    it('un trabajador no puede consultar quien ha votado', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const voter = await createUserAndLogin({ username: 'carlos01' })

      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night' },
      })
      const poll = await json<PollDetailDTO>(created)

      const response = await call('/api/polls/' + poll.id + '/participation', {
        cookie: voter.cookie,
      })
      expect(response.status).toBe(403)
    })
  })

  describe('usuarios', () => {
    it('crea un usuario y nunca devuelve la contrasena', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      const response = await call('/api/users', {
        method: 'POST',
        cookie: admin.cookie,
        body: {
          name: 'Carlos Perez',
          username: 'carlos01',
          password: 'Secreta123',
          role: 'VOTER',
          status: 'ACTIVE',
        },
      })

      expect(response.status).toBe(201)
      const body = await json<{ user: UserDTO }>(response)
      expect(body.user.username).toBe('carlos01')
      expect(JSON.stringify(body)).not.toContain('Secreta123')
      expect(JSON.stringify(body)).not.toContain('password_hash')

      // La contrasena guardada es un hash, no el texto original.
      const row = await env.DB.prepare(
        'SELECT password_hash FROM users WHERE username_lower = ?',
      )
        .bind('carlos01')
        .first<{ password_hash: string }>()
      expect(row?.password_hash.startsWith('pbkdf2-sha256$')).toBe(true)
    })

    it('impide repetir el nombre de usuario, aun con otras mayusculas', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const payload = {
        name: 'Carlos',
        username: 'carlos01',
        password: 'Secreta123',
        role: 'VOTER',
        status: 'ACTIVE',
      }

      expect((await call('/api/users', { method: 'POST', cookie: admin.cookie, body: payload })).status).toBe(201)

      const duplicate = await call('/api/users', {
        method: 'POST',
        cookie: admin.cookie,
        body: { ...payload, username: 'CARLOS01' },
      })
      expect(duplicate.status).toBe(409)
      expect((await json<{ error: { code: string } }>(duplicate)).error.code).toBe('USERNAME_TAKEN')
    })

    it('rechaza contrasenas debiles', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      const response = await call('/api/users', {
        method: 'POST',
        cookie: admin.cookie,
        body: { name: 'Carlos', username: 'carlos01', password: 'corta', role: 'VOTER' },
      })

      expect(response.status).toBe(422)
      const body = await json<{ error: { code: string; details?: Record<string, string[]> } }>(response)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.details?.password).toBeTruthy()
    })

    it('restablecer la contrasena cierra las sesiones del usuario', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const carlos = await createUserAndLogin({ username: 'carlos01', password: 'Secreta123' })

      const reset = await call('/api/users/' + carlos.id + '/reset-password', {
        method: 'POST',
        cookie: admin.cookie,
        body: { password: 'Temporal2026', mustChangePassword: true },
      })
      expect(reset.status).toBe(200)

      // La sesion anterior queda revocada.
      expect((await call('/api/auth/me', { cookie: carlos.cookie })).status).toBe(401)

      // Y con la clave nueva entra, pero debe cambiarla.
      const login = await call('/api/auth/login', {
        method: 'POST',
        body: { username: 'carlos01', password: 'Temporal2026' },
      })
      expect(login.status).toBe(200)
      expect((await json<{ user: { mustChangePassword: boolean } }>(login)).user.mustChangePassword).toBe(true)
    })

    it('bloquea al usuario con cambio de contrasena pendiente', async () => {
      const carlos = await createUserAndLogin({
        username: 'carlos01',
        mustChangePassword: true,
      })

      const response = await call('/api/me/polls', { cookie: carlos.cookie })
      expect(response.status).toBe(403)
      expect((await json<{ error: { code: string } }>(response)).error.code).toBe(
        'PASSWORD_CHANGE_REQUIRED',
      )
    })

    it('no deja que el sistema se quede sin administradores', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      const demote = await call('/api/users/' + admin.id, {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { role: 'VOTER' },
      })
      expect(demote.status).toBe(403)

      const remove = await call('/api/users/' + admin.id, {
        method: 'DELETE',
        cookie: admin.cookie,
      })
      expect(remove.status).toBe(403)
    })

    it('busca y filtra usuarios', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      await createUser({ username: 'carlos01', name: 'Carlos Perez' })
      await createUser({ username: 'maria01', name: 'Maria Lopez', status: 'INACTIVE' })

      const search = await json<PaginatedDTO<UserDTO>>(
        await call('/api/users?q=maria', { cookie: admin.cookie }),
      )
      expect(search.items).toHaveLength(1)
      expect(search.items[0]?.username).toBe('maria01')

      const inactive = await json<PaginatedDTO<UserDTO>>(
        await call('/api/users?status=INACTIVE', { cookie: admin.cookie }),
      )
      expect(inactive.items.every((user) => user.status === 'INACTIVE')).toBe(true)
    })
  })

  describe('ciclo de vida de la votacion', () => {
    it('recorre borrador -> publicada -> activa -> cerrada -> archivada', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night — Septiembre' },
      })
      const poll = await json<PollDetailDTO>(created)
      expect(poll.status).toBe('DRAFT')

      await call('/api/polls/' + poll.id + '/options', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Interstellar' },
      })

      const steps: Array<[string, string]> = [
        ['publish', 'PUBLISHED'],
        ['open', 'ACTIVE'],
        ['close', 'CLOSED'],
        ['archive', 'ARCHIVED'],
      ]

      for (const [transition, expected] of steps) {
        const response = await call('/api/polls/' + poll.id + '/' + transition, {
          method: 'POST',
          cookie: admin.cookie,
        })
        expect(response.status, transition).toBe(200)
        expect((await json<PollDetailDTO>(response)).status).toBe(expected)
      }

      // Una votacion archivada no se puede volver a abrir directamente.
      const reopen = await call('/api/polls/' + poll.id + '/open', {
        method: 'POST',
        cookie: admin.cookie,
      })
      expect(reopen.status).toBe(409)
    })

    it('publicar con fecha de inicio futura deja la votacion programada', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const startsAt = new Date(Date.now() + 3_600_000).toISOString()

      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night programada', startsAt },
      })
      const poll = await json<PollDetailDTO>(created)

      await call('/api/polls/' + poll.id + '/options', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Interstellar' },
      })

      const published = await call('/api/polls/' + poll.id + '/publish', {
        method: 'POST',
        cookie: admin.cookie,
      })
      expect((await json<PollDetailDTO>(published)).status).toBe('SCHEDULED')
    })

    it('duplicar copia configuracion y peliculas pero no votos ni estado', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const carlos = await createUserAndLogin({ username: 'carlos01' })

      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: {
          title: 'Movie Night — Agosto',
          description: 'Original',
          allowVoteChange: false,
          showLiveResults: true,
          showResultsAfterClose: false,
        },
      })
      const original = await json<PollDetailDTO>(created)

      const optionResponse = await call('/api/polls/' + original.id + '/options', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Interstellar', year: 2014 },
      })
      const option = (await json<{ option: { id: string } }>(optionResponse)).option

      await call('/api/polls/' + original.id + '/publish', { method: 'POST', cookie: admin.cookie })
      await call('/api/polls/' + original.id + '/open', { method: 'POST', cookie: admin.cookie })
      await call('/api/polls/' + original.id + '/vote', {
        method: 'POST',
        cookie: carlos.cookie,
        body: { optionId: option.id },
      })

      const duplicated = await call('/api/polls/' + original.id + '/duplicate', {
        method: 'POST',
        cookie: admin.cookie,
        body: {},
      })
      expect(duplicated.status).toBe(201)
      const copy = await json<PollDetailDTO>(duplicated)

      expect(copy.id).not.toBe(original.id)
      expect(copy.slug).not.toBe(original.slug)
      expect(copy.status).toBe('DRAFT')
      expect(copy.description).toBe('Original')
      expect(copy.allowVoteChange).toBe(false)
      expect(copy.showLiveResults).toBe(true)
      expect(copy.showResultsAfterClose).toBe(false)
      expect(copy.options).toHaveLength(1)
      expect(copy.options[0]?.title).toBe('Interstellar')
      expect(copy.options[0]?.id).not.toBe(option.id)

      // Sin votos ni marcas de tiempo del original.
      expect(copy.totalVotes).toBe(0)
      expect(copy.publishedAt).toBeNull()
      expect(copy.openedAt).toBeNull()
    })

    it('reordena la cartelera y persiste el orden', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night' },
      })
      const poll = await json<PollDetailDTO>(created)

      const ids: string[] = []
      for (const title of ['A', 'B', 'C']) {
        const response = await call('/api/polls/' + poll.id + '/options', {
          method: 'POST',
          cookie: admin.cookie,
          body: { title },
        })
        ids.push((await json<{ option: { id: string } }>(response)).option.id)
      }

      const reversed = [...ids].reverse()
      const reorder = await call('/api/polls/' + poll.id + '/options/reorder', {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { optionIds: reversed },
      })
      expect(reorder.status).toBe(200)

      const detail = await json<PollDetailDTO>(
        await call('/api/polls/' + poll.id, { cookie: admin.cookie }),
      )
      expect(detail.options.map((option) => option.id)).toEqual(reversed)
    })

    it('rechaza un orden que no coincide con la cartelera', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night' },
      })
      const poll = await json<PollDetailDTO>(created)

      await call('/api/polls/' + poll.id + '/options', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'A' },
      })

      const response = await call('/api/polls/' + poll.id + '/options/reorder', {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { optionIds: ['id-inventado'] },
      })
      expect(response.status).toBe(422)
    })

    it('valida que la finalizacion sea posterior al inicio', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      const response = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: {
          title: 'Movie Night',
          startsAt: '2026-09-21T18:00:00.000Z',
          endsAt: '2026-09-21T10:00:00.000Z',
        },
      })

      expect(response.status).toBe(422)
    })
  })

  describe('auditoria', () => {
    it('registra la creacion de usuarios y los cambios de estado de la votacion', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })

      await call('/api/users', {
        method: 'POST',
        cookie: admin.cookie,
        body: { name: 'Carlos', username: 'carlos01', password: 'Secreta123', role: 'VOTER' },
      })

      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night' },
      })
      const poll = await json<PollDetailDTO>(created)

      await call('/api/polls/' + poll.id + '/options', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Interstellar' },
      })
      await call('/api/polls/' + poll.id + '/publish', { method: 'POST', cookie: admin.cookie })

      const logs = await json<PaginatedDTO<{ action: string; actorUsername: string | null }>>(
        await call('/api/audit-logs', { cookie: admin.cookie }),
      )
      const actions = logs.items.map((log) => log.action)

      expect(actions).toContain('user.created')
      expect(actions).toContain('poll.created')
      expect(actions).toContain('option.created')
      expect(actions).toContain('poll.published')
      expect(logs.items.every((log) => log.actorUsername === 'admin' || log.actorUsername === null)).toBe(true)
    })

    it('deja constancia cuando el administrador consulta las elecciones individuales', async () => {
      const admin = await createUserAndLogin({ username: 'admin', role: 'ADMIN' })
      const created = await call('/api/polls', {
        method: 'POST',
        cookie: admin.cookie,
        body: { title: 'Movie Night' },
      })
      const poll = await json<PollDetailDTO>(created)

      // Sin pedirlo, la respuesta no incluye las elecciones.
      const plain = await json<{ participation: { includesChoices: boolean } }>(
        await call('/api/polls/' + poll.id + '/participation', { cookie: admin.cookie }),
      )
      expect(plain.participation.includesChoices).toBe(false)

      await call('/api/polls/' + poll.id + '/participation?includeChoices=true', {
        cookie: admin.cookie,
      })

      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS value FROM audit_logs WHERE action = 'participation.choices_viewed'",
      ).first<{ value: number }>()
      expect(row?.value).toBe(1)
    })
  })
})
