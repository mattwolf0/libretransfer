import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/live', { schema: { tags: ['health'] } }, async () => ({ status: 'ok' }))

  app.get('/ready', { schema: { tags: ['health'] } }, async (_request, reply) => {
    app.db.check()
    const available = (
      await Promise.all(app.storages.map((storage) => app.files.available(storage)))
    ).some(Boolean)
    if (!app.storages.length || !available) {
      reply.code(503)
      return { status: 'waiting', detail: 'No storage is available.' }
    }
    return { status: 'ok' }
  })
}
