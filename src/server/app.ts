import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODES } from '../shared/constants'
import type { ApiErrorBody } from '../shared/types'
import type { AppEnv } from './env'
import { AppError } from './lib/errors'
import { newId } from './lib/crypto'
import { sessionMiddleware } from './middleware/auth'
import { csrfProtection } from './middleware/csrf'
import { authRoutes } from './routes/auth'
import { auditRoutes, dashboardRoutes } from './routes/dashboard'
import { mediaRoutes } from './routes/media'
import { pollAdminRoutes } from './routes/polls'
import { userRoutes } from './routes/users'
import { surveyParticipationRoutes } from './routes/survey-participation'
import { surveyRoutes } from './routes/surveys'
import { voterRoutes } from './routes/voter'
import { votingRoutes } from './routes/voting'

/**
 * Aplicacion HTTP.
 *
 * Todo lo que cuelga de `/api` esta detras de `sessionMiddleware` y, salvo
 * el login, exige sesion. No existe ningun endpoint que devuelva datos de
 * votaciones sin autenticacion.
 */
export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('requestId', newId())
    c.set('user', null)
    c.set('sessionId', null)
    await next()
  })

  // Sesion y proteccion CSRF para toda la API.
  app.use('/api/*', sessionMiddleware)
  app.use('/api/*', csrfProtection)

  app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }))

  app.route('/api/auth', authRoutes)
  app.route('/api/users', userRoutes)
  // Dos routers comparten el prefijo: administracion y votacion.
  app.route('/api/polls', pollAdminRoutes)
  app.route('/api/polls', votingRoutes)
  app.route('/api/me', voterRoutes)
  app.route('/api/surveys', surveyRoutes)
  app.route('/api/me/surveys', surveyParticipationRoutes)
  app.route('/api/dashboard', dashboardRoutes)
  app.route('/api/audit-logs', auditRoutes)
  app.route('/api', mediaRoutes)

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Recurso no encontrado' },
    }
    return c.json(body, 404)
  })

  /**
   * Manejo de errores centralizado.
   *
   * Los errores de dominio (`AppError`) viajan con su codigo y mensaje.
   * Cualquier otro se convierte en un 500 generico: nunca se expone el
   * mensaje interno, la consulta SQL ni la traza.
   */
  app.onError((error, c) => {
    if (error instanceof AppError) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          ...(error.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
      }
      if (error.retryAfterSeconds !== undefined) {
        c.header('Retry-After', String(error.retryAfterSeconds))
      }
      return c.json(body, error.status as ContentfulStatusCode)
    }

    console.error('[unhandled]', c.get('requestId'), error)

    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Ha ocurrido un error inesperado. Intentalo de nuevo.',
      },
    }
    return c.json(body, 500)
  })

  return app
}

export const app = createApp()
