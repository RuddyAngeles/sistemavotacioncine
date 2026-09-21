import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { app } from '../src/server/app'
import { hashPassword } from '../src/server/lib/crypto'
import type { Role, UserStatus } from '../src/shared/types'

const BASE = 'http://localhost'

export interface RequestOptions {
  method?: string
  body?: unknown
  cookie?: string | null
  headers?: Record<string, string>
}

/** Lanza una peticion contra la aplicacion Hono real. */
export async function call(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.cookie) headers['Cookie'] = options.cookie

  const request = new Request(BASE + path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })

  const ctx = createExecutionContext()
  const response = await app.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Extrae la cookie de sesion de una respuesta de login. */
export function sessionCookie(response: Response): string {
  const header = response.headers.get('Set-Cookie')
  if (!header) throw new Error('La respuesta no incluye Set-Cookie')
  const value = header.split(';')[0]
  if (!value) throw new Error('Cookie de sesion vacia')
  return value
}

let counter = 0

/** Crea un usuario directamente en la base, sin pasar por la API. */
export async function createUser(options: {
  username?: string
  password?: string
  name?: string
  role?: Role
  status?: UserStatus
  mustChangePassword?: boolean
} = {}): Promise<{ id: string; username: string; password: string }> {
  counter += 1
  const username = options.username ?? 'usuario' + counter
  const password = options.password ?? 'Secreta123'
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const hash = await hashPassword(password, 1000)

  await env.DB.prepare(
    `INSERT INTO users (id, name, username, username_lower, password_hash, role, status,
       must_change_password, password_changed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      options.name ?? 'Usuario ' + counter,
      username,
      username.toLowerCase(),
      hash,
      options.role ?? 'VOTER',
      options.status ?? 'ACTIVE',
      options.mustChangePassword ? 1 : 0,
      now,
      now,
      now,
    )
    .run()

  return { id, username, password }
}

/** Crea el usuario e inicia sesion, devolviendo la cookie lista para usar. */
export async function createUserAndLogin(
  options: Parameters<typeof createUser>[0] = {},
): Promise<{ id: string; username: string; cookie: string }> {
  const user = await createUser(options)
  const response = await call('/api/auth/login', {
    method: 'POST',
    body: { username: user.username, password: user.password },
  })

  if (response.status !== 200) {
    throw new Error('El login de prueba ha fallado con estado ' + response.status)
  }

  return { id: user.id, username: user.username, cookie: sessionCookie(response) }
}

/** Limpia todas las tablas entre tests que lo necesiten. */
export async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM votes'),
    env.DB.prepare('DELETE FROM poll_options'),
    env.DB.prepare('DELETE FROM polls'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM audit_logs'),
    env.DB.prepare('DELETE FROM login_attempts'),
    env.DB.prepare('DELETE FROM users'),
  ])
  counter = 0
}
