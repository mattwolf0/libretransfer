import type { FastifyRequest } from 'fastify'

import type { AppDatabase } from './database.js'
import type { User } from './models.js'
import { nowIso } from './models.js'

export function addAudit(
  db: AppDatabase,
  request: FastifyRequest,
  event: string,
  target = '',
  user?: User,
) {
  db.run(
    `INSERT INTO audit_entries (user_id, event, target, client_ip, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    user?.id ?? null,
    event,
    target.slice(0, 1000),
    request.ip.slice(0, 80),
    nowIso(),
  )
}
