import { webcrypto } from 'node:crypto'

/**
 * Misma implementacion de hash que el Worker (src/server/lib/crypto.ts).
 *
 * Se duplica aqui a proposito: los scripts corren en Node y el Worker en
 * workerd, y no comparten bundle. El formato del hash es identico, asi que
 * una contrasena creada por un script se verifica sin problema en la API.
 *
 * Formato: pbkdf2-sha256$<iteraciones>$<salt>$<hash>   (base64url)
 */

const ALGORITHM = 'pbkdf2-sha256'
const SALT_BYTES = 16
const KEY_BITS = 256

/**
 * Cloudflare Workers rechaza PBKDF2 por encima de 100 000 iteraciones
 * (`Pbkdf2 failed: iteration counts above 100000 are not supported`).
 *
 * Node no tiene ese limite, asi que un hash generado aqui con mas
 * iteraciones se crearia sin problema pero el Worker NO podria verificarlo
 * nunca: la cuenta quedaria inutilizable. Por eso se recorta.
 * Debe coincidir con PBKDF2_MAX_ITERATIONS en src/shared/constants.ts.
 */
export const MAX_ITERATIONS = 100_000
export const MIN_ITERATIONS = 1_000
export const DEFAULT_ITERATIONS = 100_000

function clampIterations(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_ITERATIONS
  return Math.min(Math.max(parsed, MIN_ITERATIONS), MAX_ITERATIONS)
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

async function deriveBits(password, salt, iterations) {
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(derived)
}

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const safeIterations = clampIterations(iterations)
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await deriveBits(password, salt, safeIterations)
  return [ALGORITHM, safeIterations, toBase64Url(salt), toBase64Url(derived)].join('$')
}

/** Contrasena aleatoria legible, sin caracteres ambiguos. */
export function randomPassword(length = 14) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const bytes = webcrypto.getRandomValues(new Uint8Array(length))

  let out = ''
  for (let i = 0; i < length - 2; i += 1) out += alphabet[bytes[i] % alphabet.length]
  out += digits[bytes[length - 2] % digits.length]
  out += digits[bytes[length - 1] % digits.length]
  return out
}

/** Valida las mismas reglas que `passwordSchema` en shared/schemas.ts. */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'La contrasena debe tener al menos 8 caracteres'
  }
  if (password.length > 128) return 'La contrasena no puede superar 128 caracteres'
  if (!/[a-zA-Z]/.test(password)) return 'La contrasena debe incluir al menos una letra'
  if (!/[0-9]/.test(password)) return 'La contrasena debe incluir al menos un numero'
  return null
}

/** Valida el nombre de usuario igual que `usernameSchema`. */
export function validateUsername(username) {
  if (typeof username !== 'string') return 'Usuario invalido'
  const value = username.trim().toLowerCase()
  if (value.length < 3) return 'El usuario debe tener al menos 3 caracteres'
  if (value.length > 32) return 'El usuario no puede superar 32 caracteres'
  if (!/^[a-z0-9._-]+$/.test(value)) {
    return 'Solo se permiten minusculas, numeros, punto, guion y guion bajo'
  }
  return null
}
