import type { Context } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import type { ChangePasswordInput, LoginInput } from '../../shared/schemas'
import type { SessionUserDTO } from '../../shared/types'
import { fromBool } from '../db/client'
import {
  deleteSession,
  deleteSessionsForUser,
  findSessionWithUser,
  insertSession,
  touchSession,
} from '../db/sessions'
import { findUserById, findUserByUsername, touchLastLogin, updateUserPassword } from '../db/users'
import type { AppEnv, Variables } from '../env'
import { pbkdf2Iterations, sessionTtlMs } from '../env'
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../lib/cookies'
import { generateSessionToken, hashPassword, newId, sha256Hex, verifyPassword } from '../lib/crypto'
import { AppError, unauthorized } from '../lib/errors'
import { clientIp, nowIso, userAgent } from '../lib/http'
import { assertLoginAllowed, clearLoginFailures, recordLoginAttempt } from '../lib/rate-limit'
import { recordAudit } from './audit'

/**
 * Hash ficticio con el que comparamos cuando el usuario no existe.
 * Asi el tiempo de respuesta de "usuario inexistente" y "contrasena
 * incorrecta" es equivalente y no se puede enumerar usuarios midiendolo.
 */
const DUMMY_HASH =
  'pbkdf2-sha256$1000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** Solo se escribe `last_seen_at` si ha pasado este tiempo: ahorra escrituras en D1. */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

const invalidCredentials = () =>
  new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Usuario o contrasena incorrectos')

export async function login(c: Context<AppEnv>, input: LoginInput): Promise<SessionUserDTO> {
  const db = c.env.DB
  const now = new Date()
  const iso = now.toISOString()
  const ip = clientIp(c)

  // 1. Limite de intentos ANTES de tocar la base de usuarios.
  await assertLoginAllowed(db, input.username, ip, now)

  const user = await findUserByUsername(db, input.username)

  // 2. Verificacion de contrasena (siempre se ejecuta, exista o no el usuario).
  const iterations = pbkdf2Iterations(c.env)
  const check = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH, iterations)

  if (!user || !check.valid) {
    await recordLoginAttempt(db, { identifier: input.username, ip, success: false, now: iso })
    await recordAudit(c, {
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entity: 'session',
      entityId: user?.id ?? null,
      metadata: { username: input.username, reason: user ? 'bad_password' : 'unknown_user' },
      actor: { id: user?.id ?? null, username: input.username },
    })
    throw invalidCredentials()
  }

  // 3. Cuenta desactivada: credenciales validas pero sin acceso.
  if (user.status !== 'ACTIVE') {
    await recordLoginAttempt(db, { identifier: input.username, ip, success: false, now: iso })
    await recordAudit(c, {
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entity: 'session',
      entityId: user.id,
      metadata: { username: input.username, reason: 'inactive' },
      actor: { id: user.id, username: user.username },
    })
    throw new AppError(
      403,
      ERROR_CODES.ACCOUNT_DISABLED,
      'Tu cuenta esta desactivada. Contacta con el administrador.',
    )
  }

  // 4. Rehash transparente si se subieron las iteraciones desde el ultimo login.
  if (check.needsRehash) {
    const rehashed = await hashPassword(input.password, iterations)
    await updateUserPassword(db, user.id, rehashed, fromBool(user.must_change_password), iso)
  }

  const sessionUser = await createSession(c, user.id)

  await clearLoginFailures(db, input.username)
  await recordLoginAttempt(db, { identifier: input.username, ip, success: true, now: iso })
  await touchLastLogin(db, user.id, iso)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_LOGIN,
    entity: 'session',
    entityId: user.id,
    actor: { id: user.id, username: user.username },
  })

  return {
    ...sessionUser,
    name: user.name,
    username: user.username,
    role: user.role,
    mustChangePassword: fromBool(user.must_change_password),
  }
}

/** Crea la sesion y coloca la cookie. Devuelve la identidad basica. */
async function createSession(c: Context<AppEnv>, userId: string): Promise<SessionUserDTO> {
  const token = generateSessionToken()
  const sessionId = await sha256Hex(token)
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + sessionTtlMs(c.env))

  await insertSession(c.env.DB, {
    id: sessionId,
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip: clientIp(c),
    userAgent: userAgent(c),
  })

  setSessionCookie(c, token, expiresAt)
  c.set('sessionId', sessionId)

  const user = await findUserById(c.env.DB, userId)
  return {
    id: userId,
    name: user?.name ?? '',
    username: user?.username ?? '',
    role: user?.role ?? 'VOTER',
    mustChangePassword: fromBool(user?.must_change_password),
  }
}

export async function logout(c: Context<AppEnv>): Promise<void> {
  const sessionId = c.get('sessionId')
  if (sessionId) {
    await deleteSession(c.env.DB, sessionId)
    await recordAudit(c, { action: AUDIT_ACTIONS.USER_LOGOUT, entity: 'session' })
  }
  clearSessionCookie(c)
}

export interface ResolvedSession {
  user: Variables['user']
  sessionId: string | null
}

/**
 * Traduce la cookie en un usuario autenticado.
 *
 * Es la unica fuente de identidad del backend: ninguna ruta acepta un id de
 * usuario enviado por el cliente.
 */
export async function resolveSession(c: Context<AppEnv>): Promise<ResolvedSession> {
  const token = readSessionCookie(c)
  if (!token) return { user: null, sessionId: null }

  const sessionId = await sha256Hex(token)
  const iso = nowIso()
  const row = await findSessionWithUser(c.env.DB, sessionId, iso)

  if (!row) {
    // Cookie caducada, revocada o manipulada: se limpia del navegador.
    clearSessionCookie(c)
    return { user: null, sessionId: null }
  }

  if (row.status !== 'ACTIVE') {
    // El administrador desactivo la cuenta durante la sesion.
    await deleteSession(c.env.DB, sessionId)
    clearSessionCookie(c)
    return { user: null, sessionId: null }
  }

  if (Date.now() - Date.parse(row.last_seen_at) > SESSION_TOUCH_INTERVAL_MS) {
    await touchSession(c.env.DB, sessionId, iso)
  }

  return {
    user: {
      id: row.user_id,
      name: row.name,
      username: row.username,
      role: row.role,
      status: row.status,
      mustChangePassword: fromBool(row.must_change_password),
    },
    sessionId,
  }
}

/**
 * Cambio de contrasena por el propio usuario.
 * Invalida todas las sesiones anteriores y abre una nueva para este
 * dispositivo: si alguien tenia la contrasena antigua, pierde el acceso.
 */
export async function changeOwnPassword(
  c: Context<AppEnv>,
  input: ChangePasswordInput,
): Promise<SessionUserDTO> {
  const current = c.get('user')
  if (!current) throw unauthorized()

  const db = c.env.DB
  const user = await findUserById(db, current.id)
  if (!user) throw unauthorized()

  const iterations = pbkdf2Iterations(c.env)
  const check = await verifyPassword(input.currentPassword, user.password_hash, iterations)
  if (!check.valid) {
    throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'La contrasena actual no es correcta')
  }

  const iso = nowIso()
  const hash = await hashPassword(input.newPassword, iterations)
  await updateUserPassword(db, user.id, hash, false, iso)
  await deleteSessionsForUser(db, user.id)

  const sessionUser = await createSession(c, user.id)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    entity: 'user',
    entityId: user.id,
  })

  return sessionUser
}

/** Utilidad usada al crear usuarios y al restablecer contrasenas. */
export async function hashNewPassword(c: Context<AppEnv>, password: string): Promise<string> {
  return hashPassword(password, pbkdf2Iterations(c.env))
}

export { newId }
