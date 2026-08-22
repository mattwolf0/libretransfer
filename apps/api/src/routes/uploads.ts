import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'

import type { FastifyInstance } from 'fastify'
import type { Static } from '@sinclair/typebox'

import { addAudit } from '../audit.js'
import { requireCsrf, requireLogin } from '../auth.js'
import { AppError } from '../errors.js'
import type { UploadSession, User } from '../models.js'
import { nowIso } from '../models.js'
import { commonErrors, UploadStartBody } from '../schemas.js'
import { getStorage } from '../storage.js'

export const CHUNK_BYTES = 5 * 1024 * 1024

function uploadData(upload: UploadSession) {
  return {
    id: upload.id,
    storage: upload.storage_id,
    path: upload.folder_path,
    name: upload.file_name,
    size: upload.file_size,
    offset: upload.uploaded_size,
    expires_at: upload.expires_at,
  }
}

function findUpload(app: FastifyInstance, id: string, user: User) {
  const upload = app.db.get<UploadSession>('SELECT * FROM upload_sessions WHERE id = ?', id)
  if (!upload || upload.user_id !== user.id) {
    throw new AppError('The upload session was not found.', 404, 'upload_not_found')
  }
  if (new Date(upload.expires_at).getTime() <= Date.now()) {
    throw new AppError('The upload session has expired.', 410, 'upload_expired')
  }
  return upload
}

export async function cleanupUploads(app: FastifyInstance) {
  const expired = app.db.all<UploadSession>(
    'SELECT * FROM upload_sessions WHERE expires_at <= ?',
    nowIso(),
  )
  for (const upload of expired) {
    const storage = app.storages.find((item) => item.id === upload.storage_id)
    if (storage) await app.uploads.removeTempFile(storage, upload.id).catch(() => undefined)
    app.db.run('DELETE FROM upload_sessions WHERE id = ?', upload.id)
  }
  return expired.length
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post<{ Body: Static<typeof UploadStartBody> }>(
    '/uploads',
    { schema: { tags: ['uploads'], body: UploadStartBody, response: { ...commonErrors } } },
    async (request, reply) => {
      const login = requireCsrf(request)
      const storage = getStorage(app.storages, app.db, login.user, request.body.storage, true)
      await cleanupUploads(app)
      const target = await app.uploads.prepareUpload(
        storage,
        request.body.path ?? '',
        request.body.name,
        request.body.size,
      )
      const id = randomUUID().replaceAll('-', '')
      await app.uploads.createTempFile(storage, id)
      const createdAt = new Date()
      const folderPath = target.relativePath.includes('/')
        ? target.relativePath.slice(0, target.relativePath.lastIndexOf('/'))
        : ''
      const expiresAt = new Date(
        createdAt.getTime() + app.settings.uploadSessionHours * 3_600_000,
      ).toISOString()
      try {
        app.db.run(
          `INSERT INTO upload_sessions
           (id, storage_id, user_id, folder_path, file_name, file_size, uploaded_size,
            created_at, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          id,
          storage.id,
          login.user.id,
          folderPath,
          request.body.name.normalize('NFC').trim(),
          request.body.size,
          createdAt.toISOString(),
          createdAt.toISOString(),
          expiresAt,
        )
      } catch (error) {
        await app.uploads.removeTempFile(storage, id)
        throw error
      }
      const upload = app.db.get<UploadSession>('SELECT * FROM upload_sessions WHERE id = ?', id)!
      addAudit(
        app.db,
        request,
        'upload.started',
        `${storage.id}:${target.relativePath}`,
        login.user,
      )
      reply.code(201)
      return uploadData(upload)
    },
  )

  app.get<{ Params: { uploadId: string } }>(
    '/uploads/:uploadId',
    { schema: { tags: ['uploads'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireLogin(request)
      const upload = findUpload(app, request.params.uploadId, login.user)
      const storage = getStorage(app.storages, app.db, login.user, upload.storage_id, true)
      const tempFile = await app.uploads.getTempFile(storage, upload.id)
      let size: number
      try {
        size = (await stat(tempFile)).size
      } catch {
        throw new AppError('The upload data was not found.', 404, 'upload_data_missing')
      }
      if (size > upload.file_size)
        throw new AppError('The upload data is not valid.', 409, 'upload_data_invalid')
      if (size !== upload.uploaded_size) {
        upload.uploaded_size = size
        upload.updated_at = nowIso()
        app.db.run(
          'UPDATE upload_sessions SET uploaded_size = ?, updated_at = ? WHERE id = ?',
          size,
          upload.updated_at,
          upload.id,
        )
      }
      return uploadData(upload)
    },
  )

  app.put<{ Params: { uploadId: string }; Querystring: { offset?: string }; Body: Buffer }>(
    '/uploads/:uploadId/chunk',
    {
      bodyLimit: CHUNK_BYTES + 1,
      schema: { tags: ['uploads'], response: { ...commonErrors } },
    },
    async (request) => {
      const login = requireCsrf(request)
      const upload = findUpload(app, request.params.uploadId, login.user)
      const storage = getStorage(app.storages, app.db, login.user, upload.storage_id, true)
      const offset = Number(request.query.offset)
      if (!Number.isInteger(offset) || offset < 0) {
        throw new AppError('The upload offset is not valid.', 400, 'upload_offset_invalid')
      }
      if (offset !== upload.uploaded_size) {
        throw new AppError('The upload offset has changed.', 409, 'upload_offset_changed')
      }
      const chunk = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
      if (!chunk.length || chunk.length > CHUNK_BYTES) {
        throw new AppError('The upload chunk size is not valid.', 400, 'upload_chunk_invalid')
      }
      if (offset + chunk.length > upload.file_size) {
        throw new AppError('The upload is larger than expected.', 400, 'upload_size_changed')
      }
      const uploadedSize = await app.uploads.append(storage, upload.id, offset, chunk)
      const updatedAt = new Date()
      const expiresAt = new Date(
        updatedAt.getTime() + app.settings.uploadSessionHours * 3_600_000,
      ).toISOString()
      app.db.run(
        `UPDATE upload_sessions SET uploaded_size = ?, updated_at = ?, expires_at = ? WHERE id = ?`,
        uploadedSize,
        updatedAt.toISOString(),
        expiresAt,
        upload.id,
      )
      return { ok: true, offset: uploadedSize }
    },
  )

  app.post<{ Params: { uploadId: string } }>(
    '/uploads/:uploadId/finish',
    { schema: { tags: ['uploads'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      const upload = findUpload(app, request.params.uploadId, login.user)
      const storage = getStorage(app.storages, app.db, login.user, upload.storage_id, true)
      if (upload.uploaded_size !== upload.file_size) {
        throw new AppError('The upload is not complete.', 409, 'upload_incomplete')
      }
      const tempFile = await app.uploads.getTempFile(storage, upload.id)
      let tempFileSize: number
      try {
        tempFileSize = (await stat(tempFile)).size
      } catch {
        throw new AppError('The upload data is not valid.', 409, 'upload_data_invalid')
      }
      if (tempFileSize !== upload.file_size) {
        throw new AppError('The upload data is not valid.', 409, 'upload_data_invalid')
      }
      const target = await app.uploads.prepareUpload(
        storage,
        upload.folder_path,
        upload.file_name,
        0,
      )
      await app.uploads.finishUpload(tempFile, target.targetPath)
      app.db.run('DELETE FROM upload_sessions WHERE id = ?', upload.id)
      addAudit(app.db, request, 'file.uploaded', `${storage.id}:${target.relativePath}`, login.user)
      return {
        ok: true,
        name: upload.file_name,
        path: target.relativePath,
        size: upload.file_size,
      }
    },
  )

  app.delete<{ Params: { uploadId: string } }>(
    '/uploads/:uploadId',
    { schema: { tags: ['uploads'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      const upload = findUpload(app, request.params.uploadId, login.user)
      const storage = getStorage(app.storages, app.db, login.user, upload.storage_id, true)
      await app.uploads.removeTempFile(storage, upload.id)
      app.db.run('DELETE FROM upload_sessions WHERE id = ?', upload.id)
      addAudit(app.db, request, 'upload.cancelled', `${storage.id}:${upload.file_name}`, login.user)
      return { ok: true }
    },
  )
}
