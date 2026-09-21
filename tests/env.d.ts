import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Bindings } from '../src/server/env'

/**
 * Tipado de `env` dentro de los tests.
 *
 * Los bindings los declara vitest.config.ts; aqui solo le decimos a
 * TypeScript que forma tienen.
 */
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
