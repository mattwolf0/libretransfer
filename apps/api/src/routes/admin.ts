import type { FastifyInstance } from 'fastify'
import type { Static } from '@sinclair/typebox'

import { addAudit } from '../audit.js'
import { checkAdmin, requireCsrf } from '../auth.js'
import { AppError } from '../errors.js'
import { hashPassword } from '../passwords.js'
import { commonErrors, StorageMemberBody, UserBody } from '../schemas.js'
import { createUser, findUser, listUsers } from '../users.js'

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    '/users',
    { schema: { tags: ['admin'], response: { ...commonErrors } } },
    async (request) => {
      const login = requireCsrf(request)
      checkAdmin(login)
      const users = listUsers(app.db)
      return {
        users: users.map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          active: Boolean(user.active),
        })),
      }
    },
  )

  app.post<{ Body: Static<typeof UserBody> }>(
    '/users',
    {
      schema: { tags: ['admin'], body: UserBody, response: { ...commonErrors } },
    },
    async (request, reply) => {
      const login = requireCsrf(request)
      checkAdmin(login)
      if (findUser(app.db, request.body.username)) {
        throw new AppError('A user with this name already exists.', 409, 'user_exists')
      }
      const user = createUser(
        app.db,
        request.body.username,
        await hashPassword(request.body.password),
        request.body.role,
      )
      addAudit(app.db, request, 'user.created', request.body.username, login.user)
      reply.code(201)
      return {
        id: user.id,
        username: user.username,
        role: user.role,
      }
    },
  )

  app.put<{
    Params: { storageId: string }
    Body: Static<typeof StorageMemberBody>
  }>(
    '/storages/:storageId/members',
    {
      schema: {
        tags: ['admin'],
        params: {
          type: 'object',
          required: ['storageId'],
          properties: { storageId: { type: 'string', minLength: 1, maxLength: 60 } },
        },
        body: StorageMemberBody,
        response: { ...commonErrors },
      },
    },
    async (request) => {
      const login = requireCsrf(request)
      checkAdmin(login)
      if (!app.storages.some((storage) => storage.id === request.params.storageId)) {
        throw new AppError('Storage was not found.', 404, 'storage_not_found')
      }
      if (!app.db.get('SELECT id FROM users WHERE id = ?', request.body.user_id)) {
        throw new AppError('User was not found.', 404, 'user_not_found')
      }
      app.db.run(
        `INSERT INTO storage_members (storage_id, user_id, can_upload)
         VALUES (?, ?, ?)
         ON CONFLICT(storage_id, user_id) DO UPDATE SET can_upload = excluded.can_upload`,
        request.params.storageId,
        request.body.user_id,
        request.body.can_upload ? 1 : 0,
      )
      addAudit(app.db, request, 'storage.member_saved', request.params.storageId, login.user)
      return { ok: true }
    },
  )
}
