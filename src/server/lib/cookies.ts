import type { Context } from 'hono'
import { SESSION_COOKIE_NAME } from '../../shared/constants'
import type { AppEnv } from '../env'
import { isProduction } from '../env'

/**
 * Cookie de sesion:
 *   HttpOnly  -> inaccesible desde JavaScript (no usamos localStorage)
 *   Secure    -> solo por HTTPS (se omite en http://localhost para desarrollo)
 *   SameSite  -> Lax: el navegador no la envia en peticiones cross-site,
 *                que es la primera barrera anti-CSRF
 *   Path=/    -> valida para toda la aplicacion
 */
function shouldUseSecure(c: Context<AppEnv>): boolean {
  if (isProduction(c.env)) return true
  try {
    return new URL(c.req.url).protocol === 'https:'
  } catch {
    return false
  }
}

function serialize(name: string, value: string, attributes: string[]): string {
  return [`${name}=${value}`, ...attributes].join('; ')
}

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date): void {
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
  ]
  if (shouldUseSecure(c)) attributes.push('Secure')
  c.header('Set-Cookie', serialize(SESSION_COOKIE_NAME, token, attributes), { append: true })
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT']
  if (shouldUseSecure(c)) attributes.push('Secure')
  c.header('Set-Cookie', serialize(SESSION_COOKIE_NAME, '', attributes), { append: true })
}

/** Lectura manual: evitamos dependencias extra y controlamos el parseo. */
export function readSessionCookie(c: Context<AppEnv>): string | null {
  const header = c.req.header('Cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== SESSION_COOKIE_NAME) continue
    const value = part.slice(index + 1).trim()
    return value.length > 0 ? value : null
  }
  return null
}
