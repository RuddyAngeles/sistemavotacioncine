import {
  PBKDF2_DEFAULT_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
} from '../shared/constants'
import type { SessionUserDTO } from '../shared/types'

/** Bindings declarados en wrangler.jsonc. */
export interface Bindings {
  DB: D1Database
  MEDIA: R2Bucket
  /** Static Assets del frontend. No existe en el entorno de tests. */
  ASSETS?: Fetcher

  ENVIRONMENT: string
  APP_ORIGIN: string
  SESSION_TTL_HOURS: string
  AUTH_PBKDF2_ITERATIONS: string
  MAX_UPLOAD_BYTES: string
}

/** Valores que los middlewares dejan disponibles para las rutas. */
export interface Variables {
  user: (SessionUserDTO & { status: 'ACTIVE' | 'INACTIVE' }) | null
  sessionId: string | null
  requestId: string
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }

const int = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

export const isProduction = (env: Bindings): boolean => env.ENVIRONMENT === 'production'

export const sessionTtlMs = (env: Bindings): number =>
  int(env.SESSION_TTL_HOURS, 12, 1, 24 * 30) * 60 * 60 * 1000

/**
 * El maximo lo impone el runtime, no la configuracion: pasarse hace que
 * WebCrypto falle y el login deje de funcionar. Por eso se recorta aqui.
 */
export const pbkdf2Iterations = (env: Bindings): number =>
  int(
    env.AUTH_PBKDF2_ITERATIONS,
    PBKDF2_DEFAULT_ITERATIONS,
    PBKDF2_MIN_ITERATIONS,
    PBKDF2_MAX_ITERATIONS,
  )

export const maxUploadBytes = (env: Bindings): number =>
  int(env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024, 1024, 20 * 1024 * 1024)
