import { Hono } from 'hono'
import { AUDIT_ACTIONS } from '../../shared/constants'
import { changePasswordSchema, loginSchema, updateProfileSchema } from '../../shared/schemas'
import type { SessionUserDTO } from '../../shared/types'
import { updateUser } from '../db/users'
import type { AppEnv } from '../env'
import { unauthorized } from '../lib/errors'
import { nowIso } from '../lib/http'
import { parseJsonBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'
import { recordAudit } from '../services/audit'
import { changeOwnPassword, login, logout } from '../services/auth'

export const authRoutes = new Hono<AppEnv>()

/** POST /api/auth/login */
authRoutes.post('/login', async (c) => {
  const input = await parseJsonBody(c, loginSchema)
  const user = await login(c, input)
  return c.json({ user })
})

/** POST /api/auth/logout */
authRoutes.post('/logout', async (c) => {
  await logout(c)
  return c.json({ ok: true })
})

/**
 * GET /api/auth/me
 *
 * Devuelve 401 cuando no hay sesion. El frontend lo usa como unica fuente
 * de verdad de "estoy autenticado": no guarda nada en localStorage.
 */
authRoutes.get('/me', (c) => {
  const user = c.get('user')
  if (!user) throw unauthorized()

  const payload: SessionUserDTO = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    canAnswerSurveys: user.canAnswerSurveys,
  }
  return c.json({ user: payload })
})

/**
 * PATCH /api/auth/me
 *
 * Cada persona puede cambiar su propio nombre visible, que es el que aparece
 * en la lista de participacion. No puede tocar su usuario, su rol ni su
 * estado: eso sigue siendo cosa del administrador.
 */
authRoutes.patch('/me', requireAuth, async (c) => {
  const current = c.get('user')
  if (!current) throw unauthorized()

  const input = await parseJsonBody(c, updateProfileSchema)
  await updateUser(c.env.DB, current.id, { name: input.name }, nowIso())

  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_UPDATED,
    entity: 'user',
    entityId: current.id,
    metadata: { campo: 'name', de: current.name, a: input.name, propio: true },
  })

  const payload: SessionUserDTO = {
    id: current.id,
    name: input.name,
    username: current.username,
    role: current.role,
    mustChangePassword: current.mustChangePassword,
    canAnswerSurveys: current.canAnswerSurveys,
  }
  return c.json({ user: payload })
})

/** POST /api/auth/change-password */
authRoutes.post('/change-password', requireAuth, async (c) => {
  const input = await parseJsonBody(c, changePasswordSchema)
  const user = await changeOwnPassword(c, input)
  return c.json({ user })
})
