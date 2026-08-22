import { setTimeout as delay } from 'node:timers/promises'

import type { FastifyInstance } from 'fastify'
import type { Static } from '@sinclair/typebox'

import { addAudit } from '../audit.js'
import {
  addLoginFailure,
  checkLoginLimit,
  clearLoginCookie,
  clearLoginFailures,
  createLogin,
  readLogin,
  requireCsrf,
  setLoginCookie,
} from '../auth.js'
import { AppError } from '../errors.js'
import type { User } from '../models.js'
import { checkPassword, hashPassword, passwordNeedsUpgrade } from '../passwords.js'
import { commonErrors, LoginBody } from '../schemas.js'

export async function authRoutes(app: FastifyInstance) {
  app.get('/session', { schema: { tags: ['session'] } }, async (request) => {
    const login = readLogin(request)
    if (!login) return { authenticated: false }
    return {
      authenticated: true,
      username: login.user.username,
      csrf: login.session.csrf_token,
    }
  })

  app.post<{ Body: Static<typeof LoginBody> }>(
    '/login',
    {
      schema: {
        tags: ['session'],
        body: LoginBody,
        response: { ...commonErrors },
      },
    },
    async (request, reply) => {
      const key = `${request.ip}:${request.body.username.toLocaleLowerCase()}`.slice(0, 160)
      checkLoginLimit(app.db, key)
      const user = app.db.get<User>(
        'SELECT * FROM users WHERE username = ? AND active = 1',
        request.body.username,
      )
      if (!user || !(await checkPassword(request.body.password, user.password_hash))) {
        addLoginFailure(app.db, key, app.settings)
        addAudit(app.db, request, 'login.failed', request.body.username)
        await delay(150)
        throw new AppError('Username or password is not correct.', 401, 'login_failed')
      }
      clearLoginFailures(app.db, key)
      if (passwordNeedsUpgrade(user.password_hash)) {
        app.db.run(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          await hashPassword(request.body.password),
          user.id,
        )
      }
      const login = createLogin(app.db, user, app.settings)
      setLoginCookie(reply, login.token, app.settings)
      addAudit(app.db, request, 'login.succeeded', user.username, user)
      return { authenticated: true, username: user.username, csrf: login.session.csrf_token }
    },
  )

  app.post(
    '/logout',
    { schema: { tags: ['session'], response: { ...commonErrors } } },
    async (request, reply) => {
      const login = requireCsrf(request)
      app.db.run('DELETE FROM login_sessions WHERE id = ?', login.session.id)
      addAudit(app.db, request, 'logout', '', login.user)
      clearLoginCookie(reply, app.settings)
      return { ok: true }
    },
  )
}
