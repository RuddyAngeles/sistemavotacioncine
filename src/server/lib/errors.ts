import { ERROR_CODES } from '../../shared/constants'
import type { ErrorCode } from '../../shared/types'

/**
 * Error de dominio con codigo estable y estado HTTP.
 * Cualquier otro error que llegue al handler global se convierte en un 500
 * generico: nunca se filtra el mensaje interno ni el stack al cliente.
 */
export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details?: Record<string, string[]>
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { details?: Record<string, string[]>; retryAfterSeconds?: number },
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    if (options?.details) this.details = options.details
    if (options?.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export const unauthorized = (message = 'Debes iniciar sesion para continuar') =>
  new AppError(401, ERROR_CODES.UNAUTHORIZED, message)

export const forbidden = (message = 'No tienes permiso para realizar esta accion') =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message)

export const notFound = (message = 'No encontrado') =>
  new AppError(404, ERROR_CODES.NOT_FOUND, message)

export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message)

export const validationError = (message: string, details?: Record<string, string[]>) =>
  new AppError(422, ERROR_CODES.VALIDATION_ERROR, message, details ? { details } : undefined)

export const rateLimited = (message: string, retryAfterSeconds: number) =>
  new AppError(429, ERROR_CODES.RATE_LIMITED, message, { retryAfterSeconds })

export const internalError = (message = 'Ha ocurrido un error inesperado') =>
  new AppError(500, ERROR_CODES.INTERNAL_ERROR, message)
