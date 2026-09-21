#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { executeSql, parseArgs, queryRows, sqlString } from './lib/d1.mjs'
import { hashPassword, randomPassword, validatePassword } from './lib/password.mjs'

/**
 * Alta masiva de trabajadores.
 *
 * A partir de una lista de nombres genera, para cada uno, un usuario
 * derivado del nombre y una contrasena aleatoria, y los crea todos en una
 * sola operacion. Evita tener que darlos de alta uno a uno en la interfaz.
 *
 *   npm run create-users -- --remote --nombres "Carlos Perez, Maria Lopez"
 *   npm run create-users -- --remote --archivo nombres.txt
 *   npm run create-users -- --archivo nombres.txt --seco     (simulacro)
 *
 * Todos se crean como VOTER y activos. Las contrasenas se muestran UNA sola
 * vez: en la base solo queda su hash.
 */

const USO = `
Uso:
  npm run create-users -- [opciones]

Origen de los nombres (uno de los dos):
  --nombres "Ana Ruiz, Carlos Perez"   Lista separada por comas
  --archivo nombres.txt                Un nombre por linea

Opciones:
  --remote                 Crear en la base de Cloudflare (por defecto, la local)
  --seco                   Simulacro: muestra lo que haria sin escribir nada
  --sin-cambio-obligatorio No pedir cambio de contrasena en el primer acceso
  --csv credenciales.csv   Guardar las credenciales en un CSV (contiene las
                           contrasenas en claro: borralo tras repartirlas)
  --rol ADMIN              Crear como administradores (por defecto VOTER)
`

/** Quita acentos y deja solo lo que admite el patron de usuario. */
function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Deriva el usuario a partir del nombre, en este orden de preferencia:
 *
 *   1. carlos01                 nombre + numero
 *   2. carlosp01                + inicial del apellido, para distinguir
 *                                 homonimos de forma reconocible
 *   3. carlosp02 … carlosp99
 *   4. carlos02 … carlos99      ultimo recurso
 *
 * Devuelve null si no hay ningun hueco (nombre vacio o 200 homonimos).
 */
function derivarUsuario(nombreCompleto, ocupados) {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean)
  const nombre = normalizar(partes[0] ?? '')
  const apellido = normalizar(partes[1] ?? '')

  if (nombre.length === 0) return null

  const numerado = (base, desde) => {
    const salida = []
    for (let n = desde; n <= 99; n += 1) salida.push(base + String(n).padStart(2, '0'))
    return salida
  }

  const conApellido = apellido ? nombre + apellido[0] : null
  const candidatos = [
    nombre + '01',
    ...(conApellido ? numerado(conApellido, 1) : []),
    ...numerado(nombre, 2),
  ]

  for (const candidato of candidatos) {
    if (candidato.length < 3 || candidato.length > 32) continue
    if (ocupados.has(candidato)) continue
    return candidato
  }
  return null
}

function leerNombres(args) {
  if (args.archivo) {
    return readFileSync(String(args.archivo), 'utf8')
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !linea.startsWith('#'))
  }
  if (args.nombres) {
    return String(args.nombres)
      .split(/[,;\n]/)
      .map((nombre) => nombre.trim())
      .filter((nombre) => nombre.length > 0)
  }
  return []
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.warn(USO)
    return
  }

  const nombres = leerNombres(args)
  if (nombres.length === 0) {
    console.error('No has indicado ningun nombre.')
    console.warn(USO)
    process.exit(1)
  }

  const remote = args.remote === true
  const seco = args.seco === true
  const mustChangePassword = args['sin-cambio-obligatorio'] !== true
  const rol = args.rol === 'ADMIN' ? 'ADMIN' : 'VOTER'

  // Usuarios ya existentes, para no chocar con ellos.
  const existentes = queryRows('SELECT username_lower FROM users', { remote })
  const ocupados = new Set(existentes.map((fila) => fila.username_lower))

  const creados = []
  const descartados = []

  for (const nombre of nombres) {
    const usuario = derivarUsuario(nombre, ocupados)
    if (!usuario) {
      descartados.push({ nombre, motivo: 'no se ha podido derivar un usuario valido' })
      continue
    }

    const password = randomPassword()
    const error = validatePassword(password)
    if (error) {
      descartados.push({ nombre, motivo: error })
      continue
    }

    ocupados.add(usuario)
    creados.push({ nombre, usuario, password })
  }

  if (creados.length === 0) {
    console.error('No hay nada que crear.')
    process.exit(1)
  }

  // Tabla de credenciales, alineada para poder copiarla tal cual.
  const anchoNombre = Math.max(6, ...creados.map((c) => c.nombre.length))
  const anchoUsuario = Math.max(7, ...creados.map((c) => c.usuario.length))

  console.warn('')
  console.warn(
    '  ' +
      'Nombre'.padEnd(anchoNombre) +
      '  ' +
      'Usuario'.padEnd(anchoUsuario) +
      '  ' +
      'Contrasena',
  )
  console.warn('  ' + '-'.repeat(anchoNombre + anchoUsuario + 16))
  for (const c of creados) {
    console.warn(
      '  ' + c.nombre.padEnd(anchoNombre) + '  ' + c.usuario.padEnd(anchoUsuario) + '  ' + c.password,
    )
  }
  console.warn('')

  if (descartados.length > 0) {
    console.warn('  Descartados:')
    for (const d of descartados) console.warn('   - ' + d.nombre + ': ' + d.motivo)
    console.warn('')
  }

  if (seco) {
    console.warn('  Simulacro (--seco): no se ha escrito nada en la base de datos.\n')
    return
  }

  const now = new Date().toISOString()
  const sentencias = []

  for (const c of creados) {
    const hash = await hashPassword(c.password)
    sentencias.push(
      'INSERT INTO users (id, name, username, username_lower, password_hash, role, status, ' +
        'must_change_password, password_changed_at, created_at, updated_at) VALUES (' +
        [
          sqlString(randomUUID()),
          sqlString(c.nombre),
          sqlString(c.usuario),
          sqlString(c.usuario),
          sqlString(hash),
          sqlString(rol),
          sqlString('ACTIVE'),
          mustChangePassword ? '1' : '0',
          sqlString(now),
          sqlString(now),
          sqlString(now),
        ].join(', ') +
        ');',
    )
  }

  executeSql(sentencias.join('\n'), { remote, label: 'create-users' })

  if (args.csv) {
    const ruta = String(args.csv)
    const filas = [
      'nombre,usuario,contrasena',
      ...creados.map((c) => '"' + c.nombre.replace(/"/g, '""') + '",' + c.usuario + ',' + c.password),
    ]
    writeFileSync(ruta, filas.join('\n') + '\n', 'utf8')
    console.warn('  Credenciales guardadas en ' + ruta)
    console.warn('  Contiene contrasenas en claro: borralo en cuanto las repartas.\n')
  }

  console.warn(
    '  ' +
      creados.length +
      (creados.length === 1 ? ' usuario creado' : ' usuarios creados') +
      ' en la base ' +
      (remote ? 'de Cloudflare' : 'local') +
      '.',
  )
  console.warn('  Las contrasenas no se vuelven a mostrar: en la base solo queda su hash.')
  if (mustChangePassword) {
    console.warn('  Cada persona debera elegir su propia contrasena al entrar por primera vez.')
  }
  console.warn('')
}

main().catch((error) => {
  console.error('\nEl alta masiva ha fallado:', error.message)
  process.exit(1)
})
