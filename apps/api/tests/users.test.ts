import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppDatabase } from '../src/database.js'
import {
  changeUserPassword,
  cleanUsername,
  createUser,
  listUsers,
  renameUser,
} from '../src/users.js'

describe('user management', () => {
  let db: AppDatabase
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'libretransfer-users-'))
    db = new AppDatabase(join(root, 'users.db'))
    db.migrate()
  })

  afterEach(async () => {
    db.close()
    await rm(root, { recursive: true, force: true })
  })

  it('validates and cleans usernames', () => {
    expect(cleanUsername('  sam.dev  ')).toBe('sam.dev')
    expect(() => cleanUsername('a')).toThrow('Use 2 to 80')
    expect(() => cleanUsername('sam dev')).toThrow('Use 2 to 80')
  })

  it('creates, lists, and renames users', () => {
    createUser(db, 'zoe', 'first-hash', 'member')
    createUser(db, 'Admin2', 'second-hash', 'admin')

    expect(listUsers(db)).toMatchObject([
      { username: 'Admin2', role: 'admin', active: 1 },
      { username: 'zoe', role: 'member', active: 1 },
    ])

    expect(renameUser(db, 'zoe', 'sam')).toBe('sam')
    expect(listUsers(db).map((user) => user.username)).toEqual(['Admin2', 'sam'])
    expect(() => renameUser(db, 'sam', 'Admin2')).toThrow('new name already exists')
  })

  it('rejects duplicate users', () => {
    createUser(db, 'sam', 'first-hash', 'member')
    expect(() => createUser(db, 'sam', 'second-hash', 'member')).toThrow(
      'A user with this name already exists.',
    )
  })

  it('changes the password and removes old sessions', () => {
    const user = createUser(db, 'sam', 'first-hash', 'member')
    db.run(
      `INSERT INTO login_sessions
       (token_hash, csrf_token, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      'token-hash',
      'csrf-token',
      user.id,
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    )

    expect(changeUserPassword(db, 'sam', 'second-hash')).toBe('sam')
    expect(
      db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id),
    ).toEqual({ password_hash: 'second-hash' })
    expect(db.get('SELECT id FROM login_sessions WHERE user_id = ?', user.id)).toBeUndefined()
  })
})
