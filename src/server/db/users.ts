import type { Role, UserDTO, UserStatus } from '../../shared/types'
import { all, bool, buildUpdate, count, first, fromBool } from './client'

export interface UserRow {
  id: string
  name: string
  username: string
  username_lower: string
  password_hash: string
  role: Role
  status: UserStatus
  must_change_password: number
  last_login_at: string | null
  password_changed_at: string | null
  created_at: string
  updated_at: string
}

/** El DTO nunca incluye el hash de la contrasena. */
export function toUserDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    status: row.status,
    mustChangePassword: fromBool(row.must_change_password),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COLUMNS = [
  'id',
  'name',
  'username',
  'username_lower',
  'password_hash',
  'role',
  'status',
  'must_change_password',
  'last_login_at',
  'password_changed_at',
  'created_at',
  'updated_at',
].join(', ')

export function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return first<UserRow>(db.prepare('SELECT ' + COLUMNS + ' FROM users WHERE id = ?').bind(id))
}

export function findUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return first<UserRow>(
    db
      .prepare('SELECT ' + COLUMNS + ' FROM users WHERE username_lower = ?')
      .bind(username.toLowerCase()),
  )
}

export interface InsertUserInput {
  id: string
  name: string
  username: string
  passwordHash: string
  role: Role
  status: UserStatus
  mustChangePassword: boolean
  now: string
}

export async function insertUser(db: D1Database, input: InsertUserInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, name, username, username_lower, password_hash, role, status,
         must_change_password, password_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.username,
      input.username.toLowerCase(),
      input.passwordHash,
      input.role,
      input.status,
      bool(input.mustChangePassword),
      input.now,
      input.now,
      input.now,
    )
    .run()
}

export interface UpdateUserPatch {
  name?: string | undefined
  username?: string | undefined
  role?: Role | undefined
  status?: UserStatus | undefined
}

export async function updateUser(
  db: D1Database,
  id: string,
  patch: UpdateUserPatch,
  now: string,
): Promise<void> {
  const { clause, values } = buildUpdate({
    name: patch.name,
    username: patch.username,
    username_lower: patch.username === undefined ? undefined : patch.username.toLowerCase(),
    role: patch.role,
    status: patch.status,
    updated_at: now,
  })
  if (values.length === 0) return
  await db
    .prepare('UPDATE users SET ' + clause + ' WHERE id = ?')
    .bind(...values, id)
    .run()
}

export async function updateUserPassword(
  db: D1Database,
  id: string,
  passwordHash: string,
  mustChangePassword: boolean,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users
         SET password_hash = ?, must_change_password = ?, password_changed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(passwordHash, bool(mustChangePassword), now, now, id)
    .run()
}

export async function touchLastLogin(db: D1Database, id: string, now: string): Promise<void> {
  await db
    .prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, id)
    .run()
}

export async function deleteUser(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
}

export interface ListUsersFilters {
  q?: string | undefined
  status?: UserStatus | undefined
  role?: Role | undefined
  page: number
  pageSize: number
}

export async function listUsers(
  db: D1Database,
  filters: ListUsersFilters,
): Promise<{ items: UserRow[]; total: number }> {
  const where: string[] = []
  const params: Array<string | number> = []

  const search = filters.q?.trim().toLowerCase()
  if (search) {
    where.push('(LOWER(name) LIKE ? OR username_lower LIKE ?)')
    const like = '%' + search + '%'
    params.push(like, like)
  }
  if (filters.status) {
    where.push('status = ?')
    params.push(filters.status)
  }
  if (filters.role) {
    where.push('role = ?')
    params.push(filters.role)
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
  const offset = (filters.page - 1) * filters.pageSize

  const total = await count(
    db.prepare('SELECT COUNT(*) AS value FROM users ' + whereClause).bind(...params),
  )

  const items = await all<UserRow>(
    db
      .prepare(
        'SELECT ' +
          COLUMNS +
          ' FROM users ' +
          whereClause +
          " ORDER BY (status = 'ACTIVE') DESC, name COLLATE NOCASE ASC LIMIT ? OFFSET ?",
      )
      .bind(...params, filters.pageSize, offset),
  )

  return { items, total }
}

/**
 * Usuarios con derecho a voto: cualquier cuenta activa, sea ADMIN o VOTER.
 * El rol determina lo que puedes administrar, no si puedes participar.
 */
export function listEligibleVoters(db: D1Database): Promise<UserRow[]> {
  return all<UserRow>(
    db.prepare(
      'SELECT ' + COLUMNS + " FROM users WHERE status = 'ACTIVE' ORDER BY name COLLATE NOCASE ASC",
    ),
  )
}

export function countEligibleVoters(db: D1Database): Promise<number> {
  return count(db.prepare("SELECT COUNT(*) AS value FROM users WHERE status = 'ACTIVE'"))
}

export function countActiveAdmins(db: D1Database): Promise<number> {
  return count(
    db.prepare("SELECT COUNT(*) AS value FROM users WHERE status = 'ACTIVE' AND role = 'ADMIN'"),
  )
}

export interface UserStats {
  total: number
  active: number
  inactive: number
  admins: number
}

export async function userStats(db: D1Database): Promise<UserStats> {
  const row = await first<UserStats>(
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive,
         SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) AS admins
       FROM users`,
    ),
  )
  return {
    total: row?.total ?? 0,
    active: row?.active ?? 0,
    inactive: row?.inactive ?? 0,
    admins: row?.admins ?? 0,
  }
}
