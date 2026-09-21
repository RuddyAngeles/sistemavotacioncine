import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOGIN_RATE_LIMIT, SESSION_COOKIE_NAME } from '../../src/shared/constants'
import type { SessionUserDTO } from '../../src/shared/types'
import { call, createUser, createUserAndLogin, json, resetDatabase, sessionCookie } from '../helpers'

describe('autenticacion', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('inicia sesion con credenciales correctas y devuelve una cookie HttpOnly', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123', name: 'Carlos Perez' })

    const response = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'Secreta123' },
    })

    expect(response.status).toBe(200)

    const cookie = response.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain(SESSION_COOKIE_NAME + '=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')

    const body = await json<{ user: SessionUserDTO }>(response)
    expect(body.user.username).toBe('carlos01')
    expect(body.user.role).toBe('VOTER')
    // El cuerpo nunca debe contener nada parecido a la contrasena.
    expect(JSON.stringify(body)).not.toContain('Secreta123')
  })

  it('acepta el usuario sin distinguir mayusculas', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123' })

    const response = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'CARLOS01', password: 'Secreta123' },
    })
    expect(response.status).toBe(200)
  })

  it('rechaza la contrasena incorrecta con el mismo mensaje que un usuario inexistente', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123' })

    const wrongPassword = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'incorrecta1' },
    })
    const unknownUser = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'nadie99', password: 'incorrecta1' },
    })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)

    const a = await json<{ error: { code: string; message: string } }>(wrongPassword)
    const b = await json<{ error: { code: string; message: string } }>(unknownUser)
    // No se debe poder enumerar usuarios por la respuesta.
    expect(a.error.message).toBe(b.error.message)
    expect(a.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('impide el acceso a una cuenta desactivada', async () => {
    await createUser({ username: 'pedro01', password: 'Secreta123', status: 'INACTIVE' })

    const response = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'pedro01', password: 'Secreta123' },
    })

    expect(response.status).toBe(403)
    const body = await json<{ error: { code: string } }>(response)
    expect(body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('bloquea temporalmente tras demasiados intentos fallidos', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123' })

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT.maxAttemptsPerIdentifier; attempt += 1) {
      const response = await call('/api/auth/login', {
        method: 'POST',
        body: { username: 'carlos01', password: 'incorrecta1' },
      })
      expect(response.status).toBe(401)
    }

    // Incluso con la contrasena correcta, el usuario esta bloqueado.
    const blocked = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'Secreta123' },
    })

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    const body = await json<{ error: { code: string } }>(blocked)
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('/api/auth/me responde 401 sin sesion y los datos del usuario con ella', async () => {
    const anonymous = await call('/api/auth/me')
    expect(anonymous.status).toBe(401)

    const user = await createUserAndLogin({ username: 'maria01', name: 'Maria Lopez' })
    const authenticated = await call('/api/auth/me', { cookie: user.cookie })

    expect(authenticated.status).toBe(200)
    const body = await json<{ user: SessionUserDTO }>(authenticated)
    expect(body.user.username).toBe('maria01')
  })

  it('el cierre de sesion invalida la cookie en el servidor', async () => {
    const user = await createUserAndLogin()

    const logout = await call('/api/auth/logout', { method: 'POST', cookie: user.cookie })
    expect(logout.status).toBe(200)

    // La cookie antigua ya no sirve, aunque el navegador la conservase.
    const afterLogout = await call('/api/auth/me', { cookie: user.cookie })
    expect(afterLogout.status).toBe(401)
  })

  it('una sesion caducada deja de ser valida', async () => {
    const user = await createUserAndLogin()

    await env.DB.prepare('UPDATE sessions SET expires_at = ?')
      .bind(new Date(Date.now() - 1000).toISOString())
      .run()

    const response = await call('/api/auth/me', { cookie: user.cookie })
    expect(response.status).toBe(401)
  })

  it('desactivar a un usuario corta su sesion al instante', async () => {
    const user = await createUserAndLogin()

    await env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE id = ?").bind(user.id).run()

    const response = await call('/api/auth/me', { cookie: user.cookie })
    expect(response.status).toBe(401)
  })

  it('una cookie manipulada no da acceso', async () => {
    const response = await call('/api/auth/me', {
      cookie: SESSION_COOKIE_NAME + '=token-inventado-por-el-atacante',
    })
    expect(response.status).toBe(401)
  })

  it('el cambio de contrasena invalida las sesiones anteriores', async () => {
    const user = await createUserAndLogin({ password: 'Secreta123' })

    // Una segunda sesion del mismo usuario, como si fuese otro dispositivo.
    const second = await call('/api/auth/login', {
      method: 'POST',
      body: { username: user.username, password: 'Secreta123' },
    })
    const secondCookie = sessionCookie(second)

    const changed = await call('/api/auth/change-password', {
      method: 'POST',
      cookie: user.cookie,
      body: { currentPassword: 'Secreta123', newPassword: 'NuevaClave456' },
    })
    expect(changed.status).toBe(200)

    // La otra sesion queda revocada.
    const otherDevice = await call('/api/auth/me', { cookie: secondCookie })
    expect(otherDevice.status).toBe(401)

    // Y la contrasena nueva funciona.
    const relogin = await call('/api/auth/login', {
      method: 'POST',
      body: { username: user.username, password: 'NuevaClave456' },
    })
    expect(relogin.status).toBe(200)
  })

  it('el cambio de contrasena exige la contrasena actual', async () => {
    const user = await createUserAndLogin({ password: 'Secreta123' })

    const response = await call('/api/auth/change-password', {
      method: 'POST',
      cookie: user.cookie,
      body: { currentPassword: 'meLaInvento1', newPassword: 'NuevaClave456' },
    })

    expect(response.status).toBe(401)
  })

  it('rechaza peticiones de modificacion con un Origin ajeno (CSRF)', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123' })

    const response = await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'Secreta123' },
      headers: { Origin: 'https://sitio-malicioso.example' },
    })

    expect(response.status).toBe(403)
    const body = await json<{ error: { code: string } }>(response)
    expect(body.error.code).toBe('CSRF_ORIGIN_MISMATCH')
  })

  it('registra los intentos de acceso en la auditoria', async () => {
    await createUser({ username: 'carlos01', password: 'Secreta123' })

    await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'incorrecta1' },
    })
    await call('/api/auth/login', {
      method: 'POST',
      body: { username: 'carlos01', password: 'Secreta123' },
    })

    const logs = await env.DB.prepare(
      'SELECT action FROM audit_logs ORDER BY created_at ASC',
    ).all<{ action: string }>()

    const actions = (logs.results ?? []).map((row) => row.action)
    expect(actions).toContain('user.login_failed')
    expect(actions).toContain('user.login')
  })

  describe('cambiar el propio nombre', () => {
    it('actualiza el nombre visible', async () => {
      const user = await createUserAndLogin({ username: 'carlos01', name: 'Administrador' })

      const response = await call('/api/auth/me', {
        method: 'PATCH',
        cookie: user.cookie,
        body: { name: 'Carlos Perez' },
      })

      expect(response.status).toBe(200)
      expect((await json<{ user: SessionUserDTO }>(response)).user.name).toBe('Carlos Perez')

      // Y persiste entre peticiones.
      const me = await json<{ user: SessionUserDTO }>(
        await call('/api/auth/me', { cookie: user.cookie }),
      )
      expect(me.user.name).toBe('Carlos Perez')
    })

    it('no permite colar rol, estado ni usuario por la misma via', async () => {
      const user = await createUserAndLogin({ username: 'carlos01', name: 'Carlos' })

      await call('/api/auth/me', {
        method: 'PATCH',
        cookie: user.cookie,
        body: { name: 'Carlos Perez', role: 'ADMIN', status: 'INACTIVE', username: 'otro' },
      })

      const row = await env.DB.prepare(
        'SELECT name, role, status, username_lower FROM users WHERE id = ?',
      )
        .bind(user.id)
        .first<{ name: string; role: string; status: string; username_lower: string }>()

      expect(row?.name).toBe('Carlos Perez')
      expect(row?.role).toBe('VOTER')
      expect(row?.status).toBe('ACTIVE')
      expect(row?.username_lower).toBe('carlos01')
    })

    it('rechaza un nombre vacio y exige sesion', async () => {
      const user = await createUserAndLogin()

      const vacio = await call('/api/auth/me', {
        method: 'PATCH',
        cookie: user.cookie,
        body: { name: ' ' },
      })
      expect(vacio.status).toBe(422)

      const sinSesion = await call('/api/auth/me', { method: 'PATCH', body: { name: 'Otro' } })
      expect(sinSesion.status).toBe(401)
    })
  })

})
