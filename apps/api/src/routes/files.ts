import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Static } from '@sinclair/typebox'

import { addAudit } from '../audit.js'
import { requireCsrf, requireLogin } from '../auth.js'
import { AppError } from '../errors.js'
import type { TrashItem } from '../models.js'
import { nowIso } from '../models.js'
import { BulkTrashBody, commonErrors, FolderBody, RenameBody } from '../schemas.js'
import { getStorage, listStorages } from '../storage.js'

interface FolderQuery {
  storage?: string
  path?: string
  search?: string
  sort?: string
  direction?: string
  page?: string
  page_size?: string
}

function positiveNumber(value: string | undefined, name: string, fallback: number) {
  const number = Number(value ?? fallback)
  if (!Number.isInteger(number) || number < 1) {
    throw new AppError(`The '${name}' value is not valid.`, 400, 'query_invalid')
  }
  return number
}

function sendDownload(reply: FastifyReply, path: string, range: string | undefined, size: number) {
  const filename = basename(path).replaceAll('"', '')
  reply.header('Accept-Ranges', 'bytes')
  reply.header('Content-Type', 'application/octet-stream')
  reply.header(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  )
  if (!range) {
    reply.header('Content-Length', size)
    return reply.send(createReadStream(path))
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(range)
  if (!match) throw new AppError('The requested file range is not valid.', 416, 'range_invalid')
  const rawStart = match[1] ?? ''
  const rawEnd = match[2] ?? ''
  let start: number
  let end: number
  if (!rawStart && rawEnd) {
    const suffix = Number(rawEnd)
    if (!Number.isInteger(suffix) || suffix < 1)
      throw new AppError('The requested file range is not valid.', 416, 'range_invalid')
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : size - 1
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    reply.header('Content-Range', `bytes */${size}`)
    throw new AppError('The requested file range is not valid.', 416, 'range_invalid')
  }
  end = Math.min(end, size - 1)
  reply.code(206)
  reply.header('Content-Range', `bytes ${start}-${end}/${size}`)
  reply.header('Content-Length', end - start + 1)
  return reply.send(createReadStream(path, { start, end }))
}

export async function fileRoutes(app: FastifyInstance) {
  app.get(
    '/storages',
    { schema: { tags: ['files'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireLogin(request)
      const rows = listStorages(app.storages, app.db, login.user)
      return {
        storages: await Promise.all(
          rows.map(async ({ storage, canUpload }) => ({
            id: storage.id,
            name: storage.name,
            can_upload: canUpload,
            available: await app.files.available(storage),
          })),
        ),
      }
    },
  )

  app.get<{ Querystring: FolderQuery }>(
    '/files',
    { schema: { tags: ['files'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireLogin(request)
      const storageId = request.query.storage ?? ''
      if (!storageId) throw new AppError("The 'storage' value is not valid.", 400, 'query_invalid')
      const search = (request.query.search ?? '').trim()
      if (search.length > 180)
        throw new AppError('The search text is too long.', 400, 'search_too_long')
      const sort = request.query.sort ?? 'name'
      if (!['name', 'type', 'size', 'changed'].includes(sort)) {
        throw new AppError('The sort value is not valid.', 400, 'sort_invalid')
      }
      const direction = request.query.direction ?? 'asc'
      if (!['asc', 'desc'].includes(direction)) {
        throw new AppError('The sort direction is not valid.', 400, 'direction_invalid')
      }
      const page = positiveNumber(request.query.page, 'page', 1)
      const pageSize = positiveNumber(request.query.page_size, 'page_size', 50)
      if (![25, 50, 100].includes(pageSize)) {
        throw new AppError('The page size is not valid.', 400, 'page_size_invalid')
      }
      const storage = getStorage(app.storages, app.db, login.user, storageId)
      const access = listStorages(app.storages, app.db, login.user).find(
        (item) => item.storage.id === storage.id,
      )
      const folder = await app.files.listFolder(storage, request.query.path ?? '', {
        search,
        sort: sort as 'name' | 'type' | 'size' | 'changed',
        direction: direction as 'asc' | 'desc',
        page,
        pageSize,
      })
      return { ...folder, storage: storage.id, can_upload: access?.canUpload ?? false }
    },
  )

  app.post<{ Body: Static<typeof FolderBody> }>(
    '/folders',
    { schema: { tags: ['files'], body: FolderBody, response: { ...commonErrors } } },
    async (request, reply) => {
      const login = requireCsrf(request)
      const storage = getStorage(app.storages, app.db, login.user, request.body.storage, true)
      const path = await app.files.makeFolder(storage, request.body.path ?? '', request.body.name)
      addAudit(app.db, request, 'folder.created', `${storage.id}:${path}`, login.user)
      reply.code(201)
      return { ok: true, path, name: request.body.name.trim() }
    },
  )

  app.get<{ Querystring: { storage?: string; path?: string } }>(
    '/files/download',
    { schema: { tags: ['files'], response: { ...commonErrors, 416: commonErrors[400] } } },
    async (request, reply) => {
      const login = requireLogin(request)
      if (!request.query.storage || !request.query.path) {
        throw new AppError('The download parameters are not valid.', 400, 'query_invalid')
      }
      const storage = getStorage(app.storages, app.db, login.user, request.query.storage)
      const file = await app.files.resolvePath(storage, request.query.path, { folder: false })
      const info = await stat(file.path)
      addAudit(app.db, request, 'file.downloaded', `${storage.id}:${file.relativePath}`, login.user)
      return sendDownload(reply, file.path, request.headers.range, info.size)
    },
  )

  app.post<{ Body: Static<typeof RenameBody> }>(
    '/files/rename',
    { schema: { tags: ['files'], body: RenameBody, response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      const storage = getStorage(app.storages, app.db, login.user, request.body.storage, true)
      const path = await app.files.rename(storage, request.body.path, request.body.name)
      addAudit(app.db, request, 'file.renamed', `${storage.id}:${path}`, login.user)
      return { ok: true, path }
    },
  )

  app.delete<{ Querystring: { storage?: string; path?: string } }>(
    '/files',
    { schema: { tags: ['files'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      if (!request.query.storage || !request.query.path) {
        throw new AppError('The file parameters are not valid.', 400, 'query_invalid')
      }
      const storage = getStorage(app.storages, app.db, login.user, request.query.storage, true)
      const moved = await app.files.moveToTrash(storage, request.query.path)
      const result = app.db.run(
        `INSERT INTO trash_items (storage_id, user_id, name, old_path, trash_path, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        storage.id,
        login.user.id,
        moved.name,
        moved.oldPath,
        moved.trashPath,
        nowIso(),
      )
      addAudit(app.db, request, 'file.trashed', `${storage.id}:${moved.oldPath}`, login.user)
      return { ok: true, trash_id: Number(result.lastInsertRowid) }
    },
  )

  app.post<{ Body: Static<typeof BulkTrashBody> }>(
    '/files/bulk-trash',
    { schema: { tags: ['files'], body: BulkTrashBody, response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      const storage = getStorage(app.storages, app.db, login.user, request.body.storage, true)
      const moved: { path: string; trash_id: number }[] = []
      const failed: { path: string; error: string; code: string }[] = []
      for (const path of request.body.paths) {
        try {
          const trashed = await app.files.moveToTrash(storage, path)
          const result = app.db.run(
            `INSERT INTO trash_items (storage_id, user_id, name, old_path, trash_path, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            storage.id,
            login.user.id,
            trashed.name,
            trashed.oldPath,
            trashed.trashPath,
            nowIso(),
          )
          addAudit(app.db, request, 'file.trashed', `${storage.id}:${trashed.oldPath}`, login.user)
          moved.push({ path: trashed.oldPath, trash_id: Number(result.lastInsertRowid) })
        } catch (error) {
          const issue =
            error instanceof AppError ? error : new AppError('The file could not be moved.')
          failed.push({ path, error: issue.message, code: issue.code })
        }
      }
      return { ok: failed.length === 0, moved, failed }
    },
  )

  app.post<{ Params: { itemId: string } }>(
    '/trash/:itemId/restore',
    {
      schema: {
        tags: ['files'],
        params: {
          type: 'object',
          required: ['itemId'],
          properties: { itemId: { type: 'string', pattern: '^[1-9][0-9]*$' } },
        },
        response: { ...commonErrors },
      },
    },
    async (request) => {
      const login = requireCsrf(request)
      const item = app.db.get<TrashItem>(
        'SELECT * FROM trash_items WHERE id = ?',
        Number(request.params.itemId),
      )
      if (!item) throw new AppError('Trash item was not found.', 404, 'trash_not_found')
      if (login.user.role !== 'admin' && item.user_id !== login.user.id) {
        throw new AppError('You cannot restore this item.', 403, 'trash_forbidden')
      }
      const storage = getStorage(app.storages, app.db, login.user, item.storage_id, true)
      const path = await app.files.restore(storage, item.old_path, item.trash_path)
      app.db.run('DELETE FROM trash_items WHERE id = ?', item.id)
      addAudit(app.db, request, 'file.restored', `${storage.id}:${path}`, login.user)
      return { ok: true, path }
    },
  )
}
