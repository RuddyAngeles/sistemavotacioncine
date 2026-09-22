import { app } from './app'
import { deleteAuditLogsBefore } from './db/audit'
import { deleteExpiredSessions } from './db/sessions'
import type { Bindings } from './env'
import { applySecurityHeaders } from './lib/http'
import { cleanupLoginAttempts } from './lib/rate-limit'
import { syncScheduledPolls } from './services/polls'
import { syncScheduledSurveys } from './services/surveys'

/** Retencion de la auditoria, en dias. */
const AUDIT_RETENTION_DAYS = 365
/** Retencion de los intentos de login, en dias. */
const LOGIN_ATTEMPT_RETENTION_DAYS = 7

/**
 * Anade las cabeceras de seguridad a cualquier respuesta, venga de la API o
 * de los assets estaticos. Se hace aqui, en el borde, para que no exista
 * ninguna ruta que se las salte por olvido.
 */
function withSecurityHeaders(response: Response, env: Bindings): Response {
  const headers = new Headers(response.headers)
  applySecurityHeaders(headers, env)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // La API la sirve Hono.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const response = await app.fetch(request, env, ctx)
      return withSecurityHeaders(response, env)
    }

    // El resto son los assets del frontend (con fallback SPA a index.html).
    if (!env.ASSETS) {
      return withSecurityHeaders(new Response('Frontend no compilado', { status: 503 }), env)
    }

    const response = await env.ASSETS.fetch(request)
    return withSecurityHeaders(response, env)
  },

  /**
   * Cron trigger (cada 5 minutos).
   *
   * Abre y cierra las votaciones programadas y hace la limpieza periodica.
   * El estado tambien se recalcula al leer cada votacion, asi que el cron es
   * una red de seguridad, no el unico mecanismo.
   */
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const now = new Date()
        const iso = now.toISOString()

        try {
          const { opened, closed } = await syncScheduledPolls(env.DB, now)
          if (opened > 0 || closed > 0) {
            console.warn('[cron] votaciones abiertas: ' + opened + ', cerradas: ' + closed)
          }

          const encuestas = await syncScheduledSurveys(env.DB, now)
          if (encuestas.opened > 0 || encuestas.closed > 0) {
            console.warn(
              '[cron] encuestas abiertas: ' + encuestas.opened + ', cerradas: ' + encuestas.closed,
            )
          }

          await deleteExpiredSessions(env.DB, iso)
          await cleanupLoginAttempts(
            env.DB,
            new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * 86_400_000).toISOString(),
          )
          await deleteAuditLogsBefore(
            env.DB,
            new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000).toISOString(),
          )
        } catch (error) {
          console.error('[cron] fallo en la tarea programada', error)
        }
      })(),
    )
  },
}
