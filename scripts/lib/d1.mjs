import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Utilidades para hablar con D1 desde los scripts.
 *
 * El SQL se escribe en un fichero temporal y se ejecuta con
 * `wrangler d1 execute --file`, en lugar de pasarlo por `--command`: asi no
 * dependemos del entrecomillado del shell, que en Windows es una fuente
 * segura de problemas con sentencias largas.
 */

const TMP_DIR = join(process.cwd(), '.wrangler', 'tmp')

/** Escapa un valor para interpolarlo en SQL como literal de texto. */
export function sqlString(value) {
  if (value === null || value === undefined) return 'NULL'
  return "'" + String(value).replace(/'/g, "''") + "'"
}

export function parseArgs(argv) {
  const args = { _: [], remote: false }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--remote') {
      args.remote = true
      continue
    }
    if (token.startsWith('--')) {
      const [key, inlineValue] = token.slice(2).split('=')
      if (inlineValue !== undefined) {
        args[key] = inlineValue
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1]
        i += 1
      } else {
        args[key] = true
      }
      continue
    }
    args._.push(token)
  }

  return args
}

/**
 * Invoca wrangler a traves de su entrada de Node.
 *
 * No usamos `npx` ni `wrangler.cmd`: desde Node 18.20, lanzar un `.cmd` sin
 * shell falla con EINVAL en Windows, y hacerlo con shell obligaria a
 * entrecomillar rutas a mano. Ejecutar el JS directamente evita las dos cosas
 * y funciona igual en Windows, macOS y Linux.
 */
function runWrangler(args) {
  // `exports` de wrangler no expone `bin/`, asi que partimos de su package.json.
  const packageJsonPath = createRequire(import.meta.url).resolve('wrangler/package.json')
  const wranglerBin = join(dirname(packageJsonPath), 'bin', 'wrangler.js')

  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('wrangler ' + args.join(' ') + ' ha terminado con codigo ' + result.status)
  }
}

/** Ejecuta un bloque de SQL contra D1 (local o remoto). */
export function executeSql(sql, { remote = false, label = 'script' } = {}) {
  mkdirSync(TMP_DIR, { recursive: true })
  const file = join(TMP_DIR, label + '-' + Date.now() + '.sql')

  writeFileSync(file, sql, 'utf8')
  try {
    runWrangler(['d1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', file, '--yes'])
  } finally {
    // El fichero puede contener hashes: se borra siempre.
    rmSync(file, { force: true })
  }
}

/**
 * Ejecuta una consulta y devuelve las filas.
 *
 * `--json` hace que wrangler escriba solo JSON en stdout, sin el banner, asi
 * que se puede parsear directamente.
 */
export function queryRows(sql, { remote = false } = {}) {
  const packageJsonPath = createRequire(import.meta.url).resolve('wrangler/package.json')
  const wranglerBin = join(dirname(packageJsonPath), 'bin', 'wrangler.js')

  const result = spawnSync(
    process.execPath,
    [
      wranglerBin,
      'd1',
      'execute',
      'DB',
      remote ? '--remote' : '--local',
      '--command',
      sql,
      '--json',
    ],
    { encoding: 'utf8', cwd: process.cwd() },
  )

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('La consulta a D1 ha fallado:\n' + (result.stderr || result.stdout))
  }

  const parsed = JSON.parse(result.stdout)
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return first?.results ?? []
}

export function applyMigrations({ remote = false } = {}) {
  runWrangler(['d1', 'migrations', 'apply', 'DB', remote ? '--remote' : '--local'])
}
