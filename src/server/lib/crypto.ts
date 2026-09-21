/**
 * Primitivas criptograficas sobre WebCrypto (disponible de forma nativa en
 * Cloudflare Workers, sin dependencias ni `nodejs_compat`).
 */

const ALGORITHM = 'pbkdf2-sha256'
const SALT_BYTES = 16
const KEY_BITS = 256

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(derived)
}

/** Comparacion en tiempo constante: no revela en que byte difieren. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number)
  return diff === 0
}

/**
 * Devuelve `pbkdf2-sha256$<iteraciones>$<salt>$<hash>`.
 * Guardar las iteraciones dentro del propio hash permite subirlas en el futuro
 * sin invalidar las contrasenas existentes.
 */
export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await deriveBits(password, salt, iterations)
  return [ALGORITHM, iterations, toBase64Url(salt), toBase64Url(derived)].join('$')
}

export interface PasswordVerification {
  valid: boolean
  /** true si el hash guardado usa menos iteraciones que las configuradas ahora. */
  needsRehash: boolean
}

export async function verifyPassword(
  password: string,
  stored: string,
  currentIterations: number,
): Promise<PasswordVerification> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return { valid: false, needsRehash: false }

  const iterations = Number.parseInt(parts[1] as string, 10)
  if (!Number.isFinite(iterations) || iterations < 1) return { valid: false, needsRehash: false }

  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = fromBase64Url(parts[2] as string)
    expected = fromBase64Url(parts[3] as string)
  } catch {
    return { valid: false, needsRehash: false }
  }

  const derived = await deriveBits(password, salt, iterations)
  const valid = timingSafeEqual(derived, expected)
  return { valid, needsRehash: valid && iterations < currentIterations }
}

/** Token de sesion opaco de 256 bits. */
export function generateSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** En la base solo guardamos el SHA-256 del token, nunca el token en claro. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function newId(): string {
  return crypto.randomUUID()
}

export { toBase64Url, fromBase64Url }
