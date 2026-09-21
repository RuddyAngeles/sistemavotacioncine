import type { Context } from 'hono'
import type { AppEnv, Bindings } from '../env'
import { isProduction } from '../env'

/**
 * Cabeceras de seguridad aplicadas a TODAS las respuestas (API y assets).
 *
 * `X-Robots-Tag` es la capa de "no indexar" a nivel de red; se suma al
 * robots.txt y a la meta etiqueta. Ninguna de las tres es una medida de
 * seguridad: la proteccion real es que cada ruta exige sesion.
 */
export function applySecurityHeaders(headers: Headers, env: Bindings): void {
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
      "connect-src 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  )

  if (isProduction(env)) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}

/** IP del cliente segun Cloudflare; `unknown` en local. */
export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export function userAgent(c: Context<AppEnv>): string | null {
  const value = c.req.header('User-Agent')
  if (!value) return null
  return value.slice(0, 255)
}

export const nowIso = (): string => new Date().toISOString()

export const isoFromNow = (ms: number): string => new Date(Date.now() + ms).toISOString()
