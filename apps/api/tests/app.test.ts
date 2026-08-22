import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import type { User } from '../src/models.js'
import { hashPassword } from '../src/passwords.js'

describe('LibreTransfer API', () => {
  let app: FastifyInstance
  let root: string
  let storage: string
  let cookie = ''
  let csrf = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'libretransfer-api-'))
    storage = join(root, 'files')
    const configPath = join(root, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        folders: [
          {
            id: 'main',
            name: 'Files',
            path: 'files',
            allow_upload: true,
            create_if_missing: true,
          },
        ],
      }),
    )
    app = await buildApp({
      environment: 'test',
      databasePath: join(root, 'test.db'),
      configPath,
      webPath: join(root, 'missing-web'),
      adminUser: 'admin',
      adminPassword: 'correct-horse-battery',
      cookieSecure: false,
      allowedOrigins: ['http://testserver'],
      trustedHosts: ['testserver'],
      loginAttempts: 3,
      lockoutSeconds: 60,
      freeSpaceReserveMb: 0,
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    await rm(root, { recursive: true, force: true })
  })

  function request(options: InjectOptions) {
    return app.inject({
      ...options,
      headers: {
        host: 'testserver',
        ...(cookie ? { cookie } : {}),
        ...options.headers,
      },
    })
  }

  async function login(username = 'admin', password = 'correct-horse-battery') {
    const response = await request({
      method: 'POST',
      url: '/api/v1/login',
      payload: { username, password },
    })
    const savedCookie = response.headers['set-cookie']
    if (savedCookie)
      cookie = String(Array.isArray(savedCookie) ? savedCookie[0] : savedCookie).split(';')[0] ?? ''
    csrf = response.json<{ csrf?: string }>().csrf ?? ''
    return response
  }

  function secureHeaders(extra: Record<string, string> = {}) {
    return { 'x-csrf-token': csrf, ...extra }
  }

  async function upload(name: string, content: Buffer, path = '') {
    const started = await request({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: secureHeaders(),
      payload: { storage: 'main', path, name, size: content.length },
    })
    expect(started.statusCode).toBe(201)
    const id = started.json<{ id: string }>().id
    if (content.length) {
      const chunk = await request({
        method: 'PUT',
        url: `/api/v1/uploads/${id}/chunk?offset=0`,
        headers: secureHeaders({ 'content-type': 'application/octet-stream' }),
        payload: content,
      })
      expect(chunk.statusCode).toBe(200)
    }
    return request({
      method: 'POST',
      url: `/api/v1/uploads/${id}/finish`,
      headers: secureHeaders(),
      payload: {},
    })
  }

  it('starts healthy, loads storage config, and explains a missing web build', async () => {
    expect((await request({ method: 'GET', url: '/api/v1/health/live' })).json()).toEqual({
      status: 'ok',
    })
    expect((await request({ method: 'GET', url: '/api/v1/health/ready' })).json()).toEqual({
      status: 'ok',
    })
    const home = await request({ method: 'GET', url: '/' })
    expect(home.statusCode).toBe(503)
    expect(home.body).toContain('pnpm build')
  })

  it('uses the config as the storage source', async () => {
    await login()
    const response = await request({ method: 'GET', url: '/api/v1/storages' })
    expect(response.json().storages).toEqual([
      { id: 'main', name: 'Files', can_upload: true, available: true },
    ])
    expect(
      app.db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'storages'"),
    ).toBeUndefined()
  })

  it('creates a hashed session and requires CSRF for logout', async () => {
    expect((await login()).statusCode).toBe(200)
    const user = app.db.get<User>('SELECT * FROM users WHERE username = ?', 'admin')
    expect(user?.password_hash).not.toBe('correct-horse-battery')
    expect((await request({ method: 'GET', url: '/api/v1/session' })).json().authenticated).toBe(
      true,
    )
    expect((await request({ method: 'POST', url: '/api/v1/logout', payload: {} })).statusCode).toBe(
      403,
    )
    expect(
      (
        await request({
          method: 'POST',
          url: '/api/v1/logout',
          headers: secureHeaders(),
          payload: {},
        })
      ).statusCode,
    ).toBe(200)
  })

  it('blocks unknown origins and rate-limits repeated login failures', async () => {
    await login()
    const origin = await request({
      method: 'POST',
      url: '/api/v1/folders',
      headers: secureHeaders({ origin: 'https://bad.example' }),
      payload: { storage: 'main', path: '', name: 'blocked' },
    })
    expect(origin.statusCode).toBe(403)
    cookie = ''
    for (let index = 0; index < 3; index += 1) {
      const failed = await login('admin', 'wrong-password')
      expect(failed.statusCode).toBe(401)
    }
    const limited = await login('admin', 'wrong-password')
    expect(limited.statusCode).toBe(429)
    expect(limited.json().code).toBe('login_limited')
  })

  it('creates, lists, renames, trashes, and restores files', async () => {
    await login()
    const folder = await request({
      method: 'POST',
      url: '/api/v1/folders',
      headers: secureHeaders(),
      payload: { storage: 'main', path: '', name: 'Work' },
    })
    expect(folder.statusCode).toBe(201)
    await writeFile(join(storage, 'Work', 'note.txt'), 'hello')
    const renamed = await request({
      method: 'POST',
      url: '/api/v1/files/rename',
      headers: secureHeaders(),
      payload: { storage: 'main', path: 'Work/note.txt', name: 'saved.txt' },
    })
    expect(renamed.json().path).toBe('Work/saved.txt')
    const listed = await request({ method: 'GET', url: '/api/v1/files?storage=main&path=Work' })
    expect(listed.json().items[0].name).toBe('saved.txt')
    const deleted = await request({
      method: 'DELETE',
      url: '/api/v1/files?storage=main&path=Work%2Fsaved.txt',
      headers: secureHeaders(),
    })
    const restored = await request({
      method: 'POST',
      url: `/api/v1/trash/${deleted.json().trash_id}/restore`,
      headers: secureHeaders(),
      payload: {},
    })
    expect(restored.json().path).toBe('Work/saved.txt')
    expect(await readFile(join(storage, 'Work', 'saved.txt'), 'utf8')).toBe('hello')
  })

  it('supports resumable upload and range download', async () => {
    await login()
    const content = Buffer.from('0123456789')
    expect((await upload('numbers.txt', content)).statusCode).toBe(200)
    const download = await request({
      method: 'GET',
      url: '/api/v1/files/download?storage=main&path=numbers.txt',
      headers: { range: 'bytes=2-5' },
    })
    expect(download.statusCode).toBe(206)
    expect(download.rawPayload.toString()).toBe('2345')
  })

  it('rejects unsafe paths, hidden names, and symlinks', async () => {
    await login()
    const unsafe = await request({ method: 'GET', url: '/api/v1/files?storage=main&path=..%2F' })
    expect(unsafe.statusCode).toBe(403)
    const hidden = await request({
      method: 'POST',
      url: '/api/v1/folders',
      headers: secureHeaders(),
      payload: { storage: 'main', path: '', name: '.secret' },
    })
    expect(hidden.statusCode).toBe(400)
    const outside = join(root, 'outside')
    await mkdir(outside)
    try {
      await symlink(outside, join(storage, 'outside-link'), 'junction')
      const escaped = await request({
        method: 'GET',
        url: '/api/v1/files?storage=main&path=outside-link',
      })
      expect(escaped.statusCode).toBe(403)
    } catch {
      // Creating links can require elevated Windows permissions.
    }
  })

  it('creates a member with read-only storage access', async () => {
    await login()
    const created = await request({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: secureHeaders(),
      payload: { username: 'sam', password: 'member-password-123', role: 'member' },
    })
    expect(created.statusCode).toBe(201)
    await request({
      method: 'PUT',
      url: '/api/v1/admin/storages/main/members',
      headers: secureHeaders(),
      payload: { user_id: created.json().id, can_upload: false },
    })
    cookie = ''
    await login('sam', 'member-password-123')
    const storages = await request({ method: 'GET', url: '/api/v1/storages' })
    expect(storages.json().storages[0].can_upload).toBe(false)
    const blocked = await request({
      method: 'POST',
      url: '/api/v1/folders',
      headers: secureHeaders(),
      payload: { storage: 'main', path: '', name: 'blocked' },
    })
    expect(blocked.statusCode).toBe(403)
  })

  it('documents the API with OpenAPI', async () => {
    const response = await request({ method: 'GET', url: '/api/openapi.json' })
    expect(response.statusCode).toBe(200)
    expect(response.json().info.title).toBe('LibreTransfer API')
  })

  it('does not overwrite an existing file when an upload finishes', async () => {
    await login()
    const started = await request({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: secureHeaders(),
      payload: { storage: 'main', path: '', name: 'safe.txt', size: 4 },
    })
    const id = started.json().id
    await request({
      method: 'PUT',
      url: `/api/v1/uploads/${id}/chunk?offset=0`,
      headers: secureHeaders({ 'content-type': 'application/octet-stream' }),
      payload: Buffer.from('new!'),
    })
    await writeFile(join(storage, 'safe.txt'), 'old')
    const finished = await request({
      method: 'POST',
      url: `/api/v1/uploads/${id}/finish`,
      headers: secureHeaders(),
      payload: {},
    })
    expect(finished.statusCode).toBe(409)
    expect(await readFile(join(storage, 'safe.txt'), 'utf8')).toBe('old')
  })

  it('can authenticate another seeded admin', async () => {
    app.db.run(
      `INSERT INTO users (username, password_hash, role, active, created_at)
       VALUES (?, ?, 'admin', 1, ?)`,
      'other',
      await hashPassword('another-safe-password'),
      new Date().toISOString(),
    )
    expect((await login('other', 'another-safe-password')).statusCode).toBe(200)
  })
})
