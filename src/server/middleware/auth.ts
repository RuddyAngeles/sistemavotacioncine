import type { MiddlewareHandler } from 'hono'
import { ERROR_CODES } from '../../shared/constants'
import type { AppEnv } from '../env'
import { AppError, forbidden, unauthorized } from '../lib/errors'
import { resolveSession } from '../services/auth'

/**
 * Resuelve la sesion en cada peticion y la deja en el contexto.
 * No bloquea: las rutas publicas (login) tambien la necesitan resuelta.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { user, sessionId } = await resolveSession(c)
  c.set('user', user)
  c.set('sessionId', sessionId)
  await next()
}

/**
 * Exige sesion valida.
 *
 * Es el punto en el que se cumple la regla principal del sistema: ninguna
 * ruta privada responde sin autenticacion, aunque se conozca la URL.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw unauthorized()
  await next()
}

/** Exige rol ADMIN. Se comprueba en el servidor, nunca en el cliente. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) throw unauthorized()
  if (user.role !== 'ADMIN') throw forbidden('Esta seccion es solo para administradores')
  await next()
}

/**
 * Bloquea el resto de la aplicacion mientras el usuario tenga una contrasena
 * marcada como "debe cambiarse" (por ejemplo tras un restablecimiento).
 */
export const requireFreshPassword: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (user?.mustChangePassword) {
    throw new AppError(
      403,
      ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      'Debes cambiar tu contrasena antes de continuar',
    )
  }
  await next()
}
