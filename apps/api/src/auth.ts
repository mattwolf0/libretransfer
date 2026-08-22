import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'

import type { Settings } from './config.js'
import type { AppDatabase } from './database.js'
import { AppError } from './errors.js'
import type { LoginAttempt, LoginSession, User } from './models.js'
import { hashPassword } from './passwords.js'
import { createUser } from './users.js'

export interface ActiveLogin {
  user: User
  session: LoginSession
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function seedAdmin(db: AppDatabase, settings: Settings) {
  if (db.get('SELECT id FROM users LIMIT 1') || !settings.adminPassword) return false
  createUser(db, settings.adminUser, await hashPassword(settings.adminPassword), 'admin')
  return true
}

export function createLogin(db: AppDatabase, user: User, settings: Settings) {
  const now = new Date()
  db.run('DELETE FROM login_sessions WHERE expires_at < ?', now.toISOString())
  const token = randomBytes(32).toString('base64url')
  const csrf = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + settings.sessionHours * 3_600_000).toISOString()
  const result = db.run(
    `INSERT INTO login_sessions (token_hash, csrf_token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    tokenHash(token),
    csrf,
    user.id,
    now.toISOString(),
    expiresAt,
  )
  const session = db.get<LoginSession>(
    'SELECT * FROM login_sessions WHERE id = ?',
    Number(result.lastInsertRowid),
  )!
  return { token, session }
}

export function setLoginCookie(reply: FastifyReply, token: string, settings: Settings) {
  reply.setCookie(settings.cookieName, token, {
    path: '/',
    httpOnly: true,
    secure: settings.cookieSecure,
    sameSite: 'strict',
    maxAge: settings.sessionHours * 3600,
  })
}

export function clearLoginCookie(reply: FastifyReply, settings: Settings) {
  reply.clearCookie(settings.cookieName, {
    path: '/',
    httpOnly: true,
    secure: settings.cookieSecure,
    sameSite: 'strict',
  })
}

export function readLogin(request: FastifyRequest): ActiveLogin | null {
  const token = request.cookies[request.server.settings.cookieName]
  if (!token) return null
  const row = request.server.db.get<
    LoginSession & {
      user_id_joined: number
      username: string
      password_hash: string
      role: 'admin' | 'member'
      active: number
      user_created_at: string
    }
  >(
    `SELECT ls.*, u.id AS user_id_joined, u.username, u.password_hash, u.role, u.active,
            u.created_at AS user_created_at
     FROM login_sessions ls
     JOIN users u ON u.id = ls.user_id
     WHERE ls.token_hash = ? AND u.active = 1`,
    tokenHash(token),
  )
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    request.server.db.run('DELETE FROM login_sessions WHERE id = ?', row.id)
    return null
  }
  return {
    session: row,
    user: {
      id: row.user_id_joined,
      username: row.username,
      password_hash: row.password_hash,
      role: row.role,
      active: row.active,
      created_at: row.user_created_at,
    },
  }
}

export function requireLogin(request: FastifyRequest) {
  const login = readLogin(request)
  if (!login) throw new AppError('Please sign in first.', 401, 'login_required')
  return login
}

export function requireCsrf(request: FastifyRequest) {
  const login = requireLogin(request)
  const token = request.headers['x-csrf-token']
  const actual = Buffer.from(typeof token === 'string' ? token : '')
  const expected = Buffer.from(login.session.csrf_token)
  if (!actual.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError('The security token is missing or expired.', 403, 'csrf_invalid')
  }
  return login
}

export function checkAdmin(login: ActiveLogin) {
  if (login.user.role !== 'admin')
    throw new AppError('Admin access is required.', 403, 'admin_required')
}

export function checkLoginLimit(db: AppDatabase, key: string) {
  const attempt = db.get<LoginAttempt>('SELECT * FROM login_attempts WHERE key = ?', key)
  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
    throw new AppError('Too many login attempts. Try again later.', 429, 'login_limited')
  }
}

export function addLoginFailure(db: AppDatabase, key: string, settings: Settings) {
  const now = new Date()
  const attempt = db.get<LoginAttempt>('SELECT * FROM login_attempts WHERE key = ?', key)
  const expiredWindow =
    !attempt ||
    new Date(attempt.first_failed_at).getTime() < now.getTime() - settings.lockoutSeconds * 1000
  const failures = expiredWindow ? 1 : attempt.failures + 1
  const firstFailedAt = expiredWindow ? now.toISOString() : attempt.first_failed_at
  const lockedUntil =
    failures >= settings.loginAttempts
      ? new Date(now.getTime() + settings.lockoutSeconds * 1000).toISOString()
      : null
  db.run(
    `INSERT INTO login_attempts (key, failures, first_failed_at, locked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures,
       first_failed_at = excluded.first_failed_at, locked_until = excluded.locked_until`,
    key,
    failures,
    firstFailedAt,
    lockedUntil,
  )
}

export function clearLoginFailures(db: AppDatabase, key: string) {
  db.run('DELETE FROM login_attempts WHERE key = ?', key)
}
