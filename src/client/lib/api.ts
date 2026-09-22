import type { ApiErrorBody } from '@/shared/types'

/**
 * Cliente HTTP de la aplicacion.
 *
 * La autenticacion viaja en una cookie HttpOnly que el navegador adjunta
 * sola: aqui no se lee, ni se guarda, ni se toca ningun token. Por eso no
 * hay nada en localStorage que robar mediante XSS.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, string[]> | undefined
  readonly retryAfterSeconds: number | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string[]>,
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterSeconds = retryAfterSeconds
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }
}

const BASE = '/api'

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    body = null
  }

  const error = body?.error
  return new ApiError(
    response.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'No se ha podido completar la operacion',
    error?.details,
    error?.retryAfterSeconds,
  )
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No hay conexion con el servidor')
  }

  if (!response.ok) throw await toApiError(response)

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T

  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, signal ? { method: 'GET', signal } : { method: 'GET' }),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData): Promise<T> =>
    request<T>(path, { method: 'POST', body: formData }),
}

/** Mensaje presentable para el usuario a partir de cualquier error. */
export function errorMessage(error: unknown, fallback = 'Ha ocurrido un error'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
