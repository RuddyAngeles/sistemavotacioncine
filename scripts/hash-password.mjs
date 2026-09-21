#!/usr/bin/env node
import { parseArgs } from './lib/d1.mjs'
import { hashPassword, randomPassword, validatePassword } from './lib/password.mjs'

/**
 * Genera el hash de una contrasena con el mismo formato que usa el Worker.
 *
 * Util para operaciones manuales sobre la base de datos, por ejemplo
 * recuperar el acceso si no queda ningun administrador activo.
 *
 *   npm run hash-password -- --password "MiClave2026"
 *   npm run hash-password            (genera una contrasena aleatoria)
 */

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const generated = args.password === undefined
  const password = generated ? randomPassword() : String(args.password)

  const error = validatePassword(password)
  if (error) {
    console.error('Contrasena invalida: ' + error)
    process.exit(1)
  }

  const iterations = args.iterations ? Number(args.iterations) : undefined
  const hash = await hashPassword(password, iterations)

  console.warn('\nContrasena: ' + password)
  console.warn('Hash:       ' + hash + '\n')
  console.warn('Para aplicarlo a mano:')
  console.warn(
    "  UPDATE users SET password_hash = '" +
      hash +
      "', must_change_password = 1 WHERE username_lower = 'usuario';\n",
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
