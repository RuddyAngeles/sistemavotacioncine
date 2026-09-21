/**
 * Capa minima sobre D1.
 *
 * No usamos un ORM pesado a proposito: D1 es SQLite y `prepare().bind()` ya
 * ofrece sentencias preparadas (inmunes a inyeccion SQL) con cero bytes extra
 * en el bundle del Worker. El tipado se mantiene declarando la forma de cada
 * fila en su repositorio.
 */

export type SqlValue = string | number | null

export async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  const row = await statement.first<T>()
  return row ?? null
}

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>()
  return result.results ?? []
}

export async function count(statement: D1PreparedStatement): Promise<number> {
  const row = await statement.first<{ value: number }>()
  return row?.value ?? 0
}

/** Convierte booleanos de TypeScript al 0/1 que guarda SQLite. */
export const bool = (value: boolean): number => (value ? 1 : 0)

/** Convierte el 0/1 de SQLite a booleano. */
export const fromBool = (value: number | null | undefined): boolean => value === 1

/**
 * Construye la parte SET de un UPDATE a partir de un objeto parcial,
 * ignorando las claves `undefined` (las que el cliente no ha enviado).
 */
export function buildUpdate(patch: Record<string, SqlValue | undefined>): {
  clause: string
  values: SqlValue[]
} {
  const columns: string[] = []
  const values: SqlValue[] = []

  for (const [column, value] of Object.entries(patch)) {
    if (value === undefined) continue
    columns.push(column + ' = ?')
    values.push(value)
  }

  return { clause: columns.join(', '), values }
}

/** Indica si el error de D1 corresponde a una violacion de UNIQUE. */
export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed')
}
