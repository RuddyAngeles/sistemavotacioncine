import { Hono } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../../shared/schemas'
import type { PaginatedDTO, UserDTO } from '../../shared/types'
import { isUniqueViolation } from '../db/client'
import { deleteSessionsForUser } from '../db/sessions'
import {
  countActiveAdmins,
  deleteUser,
  findUserById,
  insertUser,
  listUsers,
  toUserDTO,
  updateUser,
  updateUserPassword,
} from '../db/users'
import type { AppEnv } from '../env'
import { newId } from '../lib/crypto'
import { AppError, conflict, forbidden, notFound } from '../lib/errors'
import { nowIso } from '../lib/http'
import { parseJsonBody, parseQuery } from '../lib/validate'
import { requireAdmin, requireFreshPassword } from '../middleware/auth'
import { hashNewPassword } from '../services/auth'
import { recordAudit } from '../services/audit'

/**
 * Gestion de usuarios: exclusiva del administrador.
 * No existe registro publico ni recuperacion de contrasena por email;
 * el administrador crea las cuentas y restablece las claves.
 */
export const userRoutes = new Hono<AppEnv>()

userRoutes.use('*', requireAdmin, requireFreshPassword)

/** GET /api/users */
userRoutes.get('/', async (c) => {
  const query = parseQuery(c, listUsersQuerySchema)
  const { items, total } = await listUsers(c.env.DB, query)

  const payload: PaginatedDTO<UserDTO> = {
    items: items.map(toUserDTO),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return c.json(payload)
})

/** POST /api/users */
userRoutes.post('/', async (c) => {
  const input = await parseJsonBody(c, createUserSchema)
  const id = newId()
  const now = nowIso()
  const passwordHash = await hashNewPassword(c, input.password)

  try {
    await insertUser(c.env.DB, {
      id,
      name: input.name,
      username: input.username,
      passwordHash,
      role: input.role,
      status: input.status,
      mustChangePassword: input.mustChangePassword,
      now,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict(ERROR_CODES.USERNAME_TAKEN, 'Ese nombre de usuario ya existe')
    }
    throw error
  }

  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: 'user',
    entityId: id,
    metadata: { username: input.username, role: input.role, status: input.status },
  })

  const created = await findUserById(c.env.DB, id)
  if (!created) throw notFound('No se pudo crear el usuario')
  return c.json({ user: toUserDTO(created) }, 201)
})

/** GET /api/users/:id */
userRoutes.get('/:id', async (c) => {
  const user = await findUserById(c.env.DB, c.req.param('id'))
  if (!user) throw notFound('El usuario no existe')
  return c.json({ user: toUserDTO(user) })
})

/** PATCH /api/users/:id */
userRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const actor = c.get('user')
  const target = await findUserById(c.env.DB, id)
  if (!target) throw notFound('El usuario no existe')

  const input = await parseJsonBody(c, updateUserSchema)

  // Salvaguardas: no dejar el sistema sin administradores ni que un admin
  // se degrade o se desactive a si mismo por error.
  const losesAdmin = target.role === 'ADMIN' && input.role === 'VOTER'
  const getsDisabled = target.status === 'ACTIVE' && input.status === 'INACTIVE'

  if (actor && actor.id === id && (losesAdmin || getsDisabled)) {
    throw forbidden('No puedes quitarte a ti mismo el acceso de administrador')
  }

  if (target.role === 'ADMIN' && (losesAdmin || getsDisabled)) {
    const admins = await countActiveAdmins(c.env.DB)
    if (admins <= 1) {
      throw new AppError(
        409,
        ERROR_CODES.LAST_ADMIN,
        'Debe existir al menos un administrador activo en el sistema',
      )
    }
  }

  try {
    await updateUser(c.env.DB, id, input, nowIso())
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict(ERROR_CODES.USERNAME_TAKEN, 'Ese nombre de usuario ya existe')
    }
    throw error
  }

  // Desactivar o renombrar a un usuario debe cortar su acceso al instante.
  if (getsDisabled || (input.username && input.username !== target.username_lower)) {
    await deleteSessionsForUser(c.env.DB, id)
  }

  await recordAudit(c, {
    action: getsDisabled
      ? AUDIT_ACTIONS.USER_DEACTIVATED
      : target.status === 'INACTIVE' && input.status === 'ACTIVE'
        ? AUDIT_ACTIONS.USER_ACTIVATED
        : AUDIT_ACTIONS.USER_UPDATED,
    entity: 'user',
    entityId: id,
    metadata: { changes: input, username: target.username },
  })

  const updated = await findUserById(c.env.DB, id)
  if (!updated) throw notFound('El usuario no existe')
  return c.json({ user: toUserDTO(updated) })
})

/** DELETE /api/users/:id */
userRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const actor = c.get('user')
  const target = await findUserById(c.env.DB, id)
  if (!target) throw notFound('El usuario no existe')

  if (actor && actor.id === id) {
    throw forbidden('No puedes eliminar tu propia cuenta')
  }

  if (target.role === 'ADMIN' && target.status === 'ACTIVE') {
    const admins = await countActiveAdmins(c.env.DB)
    if (admins <= 1) {
      throw new AppError(
        409,
        ERROR_CODES.LAST_ADMIN,
        'Debe existir al menos un administrador activo en el sistema',
      )
    }
  }

  // Las sesiones y los votos del usuario caen por ON DELETE CASCADE.
  await deleteUser(c.env.DB, id)
  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_DELETED,
    entity: 'user',
    entityId: id,
    metadata: { username: target.username, name: target.name },
  })

  return c.json({ ok: true })
})

/**
 * POST /api/users/:id/reset-password
 *
 * El administrador NO puede ver la contrasena actual (solo existe su hash):
 * unicamente puede fijar una nueva y entregarsela al trabajador.
 */
userRoutes.post('/:id/reset-password', async (c) => {
  const id = c.req.param('id')
  const target = await findUserById(c.env.DB, id)
  if (!target) throw notFound('El usuario no existe')

  const input = await parseJsonBody(c, resetPasswordSchema)
  const passwordHash = await hashNewPassword(c, input.password)

  await updateUserPassword(c.env.DB, id, passwordHash, input.mustChangePassword, nowIso())
  // Cualquier sesion abierta con la clave anterior deja de valer.
  await deleteSessionsForUser(c.env.DB, id)

  await recordAudit(c, {
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entity: 'user',
    entityId: id,
    metadata: { username: target.username, mustChangePassword: input.mustChangePassword },
  })

  return c.json({ ok: true })
})
