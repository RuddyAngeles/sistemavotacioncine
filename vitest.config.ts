import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Los tests corren dentro de `workerd` (el mismo runtime que Cloudflare
 * Workers) contra una base D1 real en memoria. Las restricciones UNIQUE, los
 * CHECK y las claves foraneas se prueban de verdad, no simuladas.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(rootDir, 'migrations'))

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2025-09-01',
          d1Databases: ['DB'],
          r2Buckets: ['MEDIA'],
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: 'test',
            APP_ORIGIN: 'http://localhost',
            SESSION_TTL_HOURS: '12',
            // Iteraciones bajas SOLO en tests, para que la suite sea rapida.
            AUTH_PBKDF2_ITERATIONS: '1000',
            MAX_UPLOAD_BYTES: '5242880',
          },
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(rootDir, 'src') },
    },
    test: {
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts'],
    },
  }
})
