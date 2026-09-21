#!/usr/bin/env node
import { executeSql, parseArgs, sqlString } from './lib/d1.mjs'
import { hashPassword } from './lib/password.mjs'

/**
 * Datos de desarrollo.
 *
 * Crea un administrador, cuatro trabajadores y una Movie Night en borrador
 * con cuatro peliculas, para poder probar el flujo completo de inmediato.
 *
 *   npm run seed            (base local de wrangler dev)
 *   npm run seed:remote     (base de Cloudflare — NO recomendado en produccion)
 *
 * Las contrasenas de abajo son PUBLICAS y solo valen para desarrollo.
 * Para crear el primer administrador real usa `npm run create-admin`.
 */

const DEV_ADMIN_PASSWORD = 'Admin2026'
const DEV_VOTER_PASSWORD = 'Movie2026'

// Ids fijos: al volver a ejecutar el seed se reemplazan las mismas filas
// en lugar de acumular duplicados.
const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  carlos: '00000000-0000-4000-8000-000000000002',
  maria: '00000000-0000-4000-8000-000000000003',
  pedro: '00000000-0000-4000-8000-000000000004',
  ana: '00000000-0000-4000-8000-000000000005',
  poll: '00000000-0000-4000-8000-0000000000a1',
  options: [
    '00000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000b3',
    '00000000-0000-4000-8000-0000000000b4',
  ],
}

const MOVIES = [
  {
    title: 'Interstellar',
    genre: 'Ciencia ficcion',
    year: 2014,
    duration: 169,
    showtime: '20:00',
    description:
      'Un grupo de exploradores atraviesa un agujero de gusano en busca de un nuevo hogar para la humanidad.',
  },
  {
    title: 'Origen',
    genre: 'Ciencia ficcion',
    year: 2010,
    duration: 148,
    showtime: '20:30',
    description: 'Un ladron de secretos se infiltra en los suenos ajenos para plantar una idea.',
  },
  {
    title: 'Gladiator',
    genre: 'Accion',
    year: 2000,
    duration: 155,
    showtime: '21:00',
    description: 'Un general romano traicionado busca venganza convertido en gladiador.',
  },
  {
    title: 'The Batman',
    genre: 'Thriller',
    year: 2022,
    duration: 176,
    showtime: '21:30',
    description: 'Batman sigue el rastro de un asesino en serie por una Gotham corrupta.',
  },
]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const remote = args.remote === true
  const iterations = args.iterations ? Number(args.iterations) : undefined

  if (remote) {
    console.warn('\n[aviso] Vas a insertar datos de PRUEBA en la base remota.')
    console.warn('        Las contrasenas del seed son publicas. No lo hagas en produccion.\n')
  }

  const now = new Date().toISOString()
  const adminHash = await hashPassword(DEV_ADMIN_PASSWORD, iterations)
  const voterHash = await hashPassword(DEV_VOTER_PASSWORD, iterations)

  const users = [
    { id: IDS.admin, name: 'Administradora', username: 'admin', hash: adminHash, role: 'ADMIN' },
    { id: IDS.carlos, name: 'Carlos Perez', username: 'carlos01', hash: voterHash, role: 'VOTER' },
    { id: IDS.maria, name: 'Maria Lopez', username: 'maria01', hash: voterHash, role: 'VOTER' },
    { id: IDS.pedro, name: 'Pedro Gomez', username: 'pedro01', hash: voterHash, role: 'VOTER' },
    { id: IDS.ana, name: 'Ana Ruiz', username: 'ana01', hash: voterHash, role: 'VOTER' },
  ]

  const statements = []

  for (const user of users) {
    statements.push(
      'INSERT OR REPLACE INTO users (id, name, username, username_lower, password_hash, role, status, ' +
        'must_change_password, password_changed_at, created_at, updated_at) VALUES (' +
        [
          sqlString(user.id),
          sqlString(user.name),
          sqlString(user.username),
          sqlString(user.username.toLowerCase()),
          sqlString(user.hash),
          sqlString(user.role),
          sqlString('ACTIVE'),
          '0',
          sqlString(now),
          sqlString(now),
          sqlString(now),
        ].join(', ') +
        ');',
    )
  }

  statements.push(
    'INSERT OR REPLACE INTO polls (id, slug, title, description, kind, status, allow_vote_change, ' +
      'show_live_results, show_results_after_close, starts_at, ends_at, published_at, opened_at, ' +
      'closed_at, archived_at, created_by, created_at, updated_at) VALUES (' +
      [
        sqlString(IDS.poll),
        sqlString('movie-night-de-prueba'),
        sqlString('Movie Night — Prueba'),
        sqlString('Votacion de ejemplo creada por el seed de desarrollo.'),
        sqlString('MOVIE_NIGHT'),
        sqlString('DRAFT'),
        '1',
        '0',
        '1',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        sqlString(IDS.admin),
        sqlString(now),
        sqlString(now),
      ].join(', ') +
      ');',
  )

  MOVIES.forEach((movie, index) => {
    statements.push(
      'INSERT OR REPLACE INTO poll_options (id, poll_id, title, description, genre, year, ' +
        'duration_minutes, showtime, poster_key, position, created_at, updated_at) VALUES (' +
        [
          sqlString(IDS.options[index]),
          sqlString(IDS.poll),
          sqlString(movie.title),
          sqlString(movie.description),
          sqlString(movie.genre),
          String(movie.year),
          String(movie.duration),
          sqlString(movie.showtime),
          'NULL',
          String(index),
          sqlString(now),
          sqlString(now),
        ].join(', ') +
        ');',
    )
  })

  executeSql(statements.join('\n'), { remote, label: 'seed' })

  console.warn('\nDatos de desarrollo creados.\n')
  console.warn('  Administrador   admin     / ' + DEV_ADMIN_PASSWORD)
  console.warn('  Trabajadores    carlos01  / ' + DEV_VOTER_PASSWORD)
  console.warn('                  maria01   / ' + DEV_VOTER_PASSWORD)
  console.warn('                  pedro01   / ' + DEV_VOTER_PASSWORD)
  console.warn('                  ana01     / ' + DEV_VOTER_PASSWORD)
  console.warn('\n  Estas credenciales son SOLO para desarrollo.\n')
}

main().catch((error) => {
  console.error('\nEl seed ha fallado:', error.message)
  process.exit(1)
})
