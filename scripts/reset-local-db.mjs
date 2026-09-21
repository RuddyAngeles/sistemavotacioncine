#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { applyMigrations } from './lib/d1.mjs'

/**
 * Borra la base D1 local de wrangler y vuelve a aplicar las migraciones.
 * Solo afecta a `.wrangler/state`: nunca toca la base remota.
 */

const STATE_DIR = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1')

if (existsSync(STATE_DIR)) {
  try {
    // En Windows el fichero SQLite puede seguir bloqueado un instante despues
    // de cerrar wrangler, de ahi los reintentos.
    rmSync(STATE_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    console.warn('Base de datos local eliminada.')
  } catch (error) {
    console.error('\nNo se ha podido borrar la base local: ' + error.code)
    console.error('Suele significar que `npm run dev` sigue abierto y tiene el fichero en uso.')
    console.error('Cierra el servidor de desarrollo y vuelve a ejecutar `npm run db:reset`.\n')
    process.exit(1)
  }
} else {
  console.warn('No habia base de datos local que eliminar.')
}

applyMigrations({ remote: false })
console.warn('\nMigraciones aplicadas. Ejecuta `npm run seed` para volver a crear los datos de prueba.')
