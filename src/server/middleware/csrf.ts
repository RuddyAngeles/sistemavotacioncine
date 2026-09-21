import type { MiddlewareHandler } from 'hono'
import { ERROR_CODES } from '../../shared/constants'
import type { AppEnv, Bindings } from '../env'
import { isProduction } from '../env'
import { AppError } from '../lib/errors'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function allowedOrigins(env: Bindings, requestUrl: string): Set<string> {
  const origins = new Set<string>()

  try {
    origins.add(new URL(requestUrl).origin)
  } catch {
    /* URL siempre valida en Workers, pero no dependemos de ello */
  }

  if (env.APP_ORIGIN) {
    try {
      origins.add(new URL(env.APP_ORIGIN).origin)
    } catch {
      /* APP_ORIGIN mal configurado: se ignora en lugar de romper el login */
    }
  }

  // En desarrollo, Vite sirve el frontend en 5173 y hace proxy al Worker en 8787.
  if (!isProduction(env)) {
    origins.add('http://localhost:5173')
    origins.add('http://127.0.0.1:5173')
    origins.add('http://localhost:8787')
    origins.add('http://127.0.0.1:8787')
  }

  return origins
}

/**
 * Proteccion CSRF por verificacion de origen.
 *
 * Defensa en profundidad, en dos capas:
 *   1. La cookie de sesion es SameSite=Lax, asi que el navegador no la envia
 *      en un POST cross-site. Un formulario de otro dominio llega sin sesion.
 *   2. Ademas, toda peticion que modifica estado debe traer un `Origin`
 *      permitido. El navegador siempre lo envia en estos metodos y no puede
 *      ser falsificado desde JavaScript.
 *
 * Si no hay `Origin` ni `Sec-Fetch-Site`, la peticion no viene de un
 * navegador (curl, tests, scripts). Se permite: no existe el escenario CSRF
 * sin navegador, y sigue haciendo falta una cookie de sesion valida.
 */
export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    await next()
    return
  }

  const origin = c.req.header('Origin')
  const secFetchSite = c.req.header('Sec-Fetch-Site')

  if (!origin) {
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      throw new AppError(403, ERROR_CODES.CSRF_ORIGIN_MISMATCH, 'Origen de la peticion no permitido')
    }
    await next()
    return
  }

  if (!allowedOrigins(c.env, c.req.url).has(origin)) {
    throw new AppError(403, ERROR_CODES.CSRF_ORIGIN_MISMATCH, 'Origen de la peticion no permitido')
  }

  await next()
}
