#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { executeSql, parseArgs, sqlString } from './lib/d1.mjs'
import { hashPassword, randomPassword, validatePassword, validateUsername } from './lib/password.mjs'

/**
 * Crea el primer administrador (o uno adicional).
 *
 * Es la unica via de alta que existe fuera de la aplicacion: el sistema no
 * tiene registro publico. Una vez dentro, el administrador crea el resto de
 * cuentas desde la interfaz.
 *
 *   npm run create-admin -- --username admin --name "Ana Ruiz" --remote
 *   npm run create-admin -- --username admin --password "MiClave2026" --remote
 *
 * Si no se pasa `--password`, se genera una aleatoria y se muestra una sola
 * vez por pantalla.
 */

function usage() {
  console.warn(`
Uso:
  npm run create-admin -- --username <usuario> [--name "<nombre>"] [--password <clave>] [--remote]

Opciones:
  --username    Nombre de usuario (minusculas, numeros, . _ -)
  --name        Nombre completo (por defecto, el del usuario)
  --password    Contrasena. Si se omite, se genera una aleatoria segura.
  --role        ADMIN (por defecto) o VOTER
  --remote      Aplicar sobre la base de Cloudflare en lugar de la local
  --iterations  Iteraciones de PBKDF2 (por defecto 120000)
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || !args.username) {
    usage()
    process.exit(args.username ? 0 : 1)
  }

  const username = String(args.username).trim().toLowerCase()
  const usernameError = validateUsername(username)
  if (usernameError) {
    console.error('Usuario invalido: ' + usernameError)
    process.exit(1)
  }

  const generated = args.password === undefined
  const password = generated ? randomPassword() : String(args.password)

  const passwordError = validatePassword(password)
  if (passwordError) {
    console.error('Contrasena invalida: ' + passwordError)
    process.exit(1)
  }

  const role = args.role === 'VOTER' ? 'VOTER' : 'ADMIN'
  const name = args.name ? String(args.name) : username
  const iterations = args.iterations ? Number(args.iterations) : undefined

  const now = new Date().toISOString()
  const hash = await hashPassword(password, iterations)

  // INSERT normal (no REPLACE): si el usuario ya existe, preferimos fallar
  // antes que pisar en silencio una cuenta real.
  const sql =
    'INSERT INTO users (id, name, username, username_lower, password_hash, role, status, ' +
    'must_change_password, password_changed_at, created_at, updated_at) VALUES (' +
    [
      sqlString(randomUUID()),
      sqlString(name),
      sqlString(username),
      sqlString(username),
      sqlString(hash),
      sqlString(role),
      sqlString('ACTIVE'),
      '0',
      sqlString(now),
      sqlString(now),
      sqlString(now),
    ].join(', ') +
    ');'

  executeSql(sql, { remote: args.remote === true, label: 'create-admin' })

  console.warn('\nCuenta creada correctamente.\n')
  console.warn('  Usuario:  ' + username)
  console.warn('  Rol:      ' + role)
  if (generated) {
    console.warn('  Clave:    ' + password)
    console.warn('\n  Guarda esta contrasena ahora: no se vuelve a mostrar y no se puede recuperar.')
    console.warn('  Cambiala desde la aplicacion en cuanto inicies sesion.\n')
  } else {
    console.warn('\n  Se ha usado la contrasena indicada en la linea de comandos.')
    console.warn('  Recuerda limpiar el historial del terminal si es un equipo compartido.\n')
  }
}

main().catch((error) => {
  console.error('\nNo se ha podido crear la cuenta:', error.message)
  console.error('Si el usuario ya existe, elige otro nombre de usuario.')
  process.exit(1)
})
