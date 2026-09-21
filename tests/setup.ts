import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

/**
 * Cada fichero de test arranca con el esquema real aplicado sobre una base
 * D1 en memoria. No hay mocks de la base de datos: las restricciones UNIQUE,
 * los CHECK y las claves foraneas se comprueban de verdad.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
