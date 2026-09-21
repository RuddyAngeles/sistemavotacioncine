import type { Context } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../env'
import { validationError } from './errors'

/**
 * Validacion de entrada con Zod.
 *
 * Toda la entrada del usuario pasa por aqui antes de tocar la base de datos.
 * Los errores se devuelven como 422 con el detalle por campo, para que el
 * formulario pueda marcarlos sin adivinar.
 */

function toDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    const bucket = details[key] ?? []
    bucket.push(issue.message)
    details[key] = bucket
  }
  return details
}

export async function parseJsonBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw validationError('El cuerpo de la peticion no es JSON valido')
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    throw validationError('Revisa los datos enviados', toDetails(result.error))
  }
  return result.data
}

export function parseQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query())
  if (!result.success) {
    throw validationError('Parametros de consulta invalidos', toDetails(result.error))
  }
  return result.data
}

export function parseValue<S extends z.ZodType>(schema: S, value: unknown, message: string): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw validationError(message, toDetails(result.error))
  }
  return result.data
}
