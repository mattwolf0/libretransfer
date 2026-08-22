import type { AppDatabase } from './database.js'
import type { User } from './models.js'
import { nowIso } from './models.js'

export type UserRole = User['role']
export type UserSummary = Pick<User, 'id' | 'username' | 'role' | 'active'>

const usernamePattern = /^[a-zA-Z0-9._-]{2,80}$/u

export function cleanUsername(value: string) {
  const username = value.trim()
  if (!usernamePattern.test(username)) {
    throw new Error('Use 2 to 80 letters, numbers, dots, dashes, or underscores.')
  }
  return username
}

export function findUser(db: AppDatabase, username: string) {
  return db.get<User>('SELECT * FROM users WHERE username = ?', username)
}

export function listUsers(db: AppDatabase) {
  return db.all<UserSummary>(
    'SELECT id, username, role, active FROM users ORDER BY username COLLATE NOCASE',
  )
}

export function createUser(
  db: AppDatabase,
  usernameValue: string,
  passwordHash: string,
  role: UserRole,
) {
  const username = cleanUsername(usernameValue)
  if (findUser(db, username)) throw new Error('A user with this name already exists.')

  const createdAt = nowIso()
  const result = db.run(
    `INSERT INTO users (username, password_hash, role, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    username,
    passwordHash,
    role,
    createdAt,
  )
  return {
    id: Number(result.lastInsertRowid),
    username,
    role,
    active: 1,
    created_at: createdAt,
  }
}

export function renameUser(db: AppDatabase, currentValue: string, nextValue: string) {
  const currentUsername = cleanUsername(currentValue)
  const nextUsername = cleanUsername(nextValue)
  const user = findUser(db, currentUsername)
  if (!user) throw new Error('User was not found.')

  const existing = findUser(db, nextUsername)
  if (existing && existing.id !== user.id) {
    throw new Error('A user with the new name already exists.')
  }

  db.run('UPDATE users SET username = ? WHERE id = ?', nextUsername, user.id)
  return nextUsername
}

export function changeUserPassword(db: AppDatabase, usernameValue: string, passwordHash: string) {
  const username = cleanUsername(usernameValue)
  const user = findUser(db, username)
  if (!user) throw new Error('User was not found.')

  db.transaction(() => {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, user.id)
    db.run('DELETE FROM login_sessions WHERE user_id = ?', user.id)
  })
  return username
}
