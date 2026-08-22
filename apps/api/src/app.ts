import { access } from 'node:fs/promises'
import { join } from 'node:path'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify'

import './app-types.js'
import { seedAdmin } from './auth.js'
import { loadSettings, type SettingsOverrides } from './config.js'
import { AppDatabase } from './database.js'
import { AppError } from './errors.js'
import { FileStore } from './fileStore.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { fileRoutes } from './routes/files.js'
import { healthRoutes } from './routes/health.js'
import { cleanupUploads, CHUNK_BYTES, uploadRoutes } from './routes/uploads.js'
import { loadStorages } from './storage.js'
import { UploadStore } from './uploadStore.js'

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function buildApp(overrides: SettingsOverrides = {}) {
  const settings = loadSettings(overrides)
  const storages = await loadStorages(settings.configPath)
  const logger: FastifyServerOptions['logger'] =
    settings.environment === 'test'
      ? false
      : settings.environment === 'development'
        ? {
            level: settings.logLevel,
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard' },
            },
          }
        : { level: settings.logLevel }
  const app = Fastify({
    trustProxy: true,
    bodyLimit: CHUNK_BYTES + 1024,
    logger,
  })

  const db = new AppDatabase(settings.databasePath)
  db.migrate()
  const files = new FileStore()
  const uploads = new UploadStore(files, settings.maxUploadBytes, settings.freeSpaceReserveBytes)
  app.decorate('settings', settings)
  app.decorate('db', db)
  app.decorate('storages', storages)
  app.decorate('files', files)
  app.decorate('uploads', uploads)

  await app.register(cookie)
  await app.register(cors, {
    origin: settings.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-ID'],
  })
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    ...(settings.environment === 'production' ? {} : { hsts: false }),
  })
  await app.register(swagger, {
    openapi: {
      info: { title: 'LibreTransfer API', version: '1.0.0' },
      tags: [
        { name: 'session', description: 'Authentication and sessions' },
        { name: 'files', description: 'Files and folders' },
        { name: 'uploads', description: 'Resumable uploads' },
        { name: 'admin', description: 'Users and storage access' },
        { name: 'health', description: 'Service health' },
      ],
    },
  })
  if (settings.environment !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/api/docs' })
  }

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: CHUNK_BYTES + 1 },
    (_request, body, done) => done(null, body),
  )

  app.addHook('onRequest', async (request) => {
    const hostname = request.hostname.toLocaleLowerCase()
    if (!settings.trustedHosts.includes(hostname)) {
      throw new AppError('This host is not allowed.', 400, 'host_forbidden')
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin
      const currentOrigin = `${request.protocol}://${request.headers.host ?? ''}`
      if (origin && origin !== currentOrigin && !settings.allowedOrigins.includes(origin)) {
        throw new AppError('This request origin is not allowed.', 403, 'origin_forbidden')
      }
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-ID', request.id)
    if (request.url.startsWith('/api/') || request.url === '/' || request.url.endsWith('.html')) {
      reply.header('Cache-Control', 'no-store')
    }
    return payload
  })

  app.setErrorHandler(async (error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.status === 429) reply.header('Retry-After', '60')
      return reply.code(error.status).send({ error: error.message, code: error.code })
    }
    if ('validation' in error && error.validation) {
      const field = error.validation[0]?.instancePath.replace(/^\//u, '').replaceAll('/', '.')
      const message = field
        ? `The '${field}' field is not valid.`
        : 'The request data is not valid.'
      return reply.code(422).send({ error: message, code: 'request_invalid' })
    }
    request.log.error({ err: error }, 'Request failed')
    return reply
      .code(500)
      .send({ error: 'The server could not complete the request.', code: 'server_error' })
  })

  await app.register(healthRoutes, { prefix: '/api/v1/health' })
  await app.register(authRoutes, { prefix: '/api/v1' })
  await app.register(fileRoutes, { prefix: '/api/v1' })
  await app.register(uploadRoutes, { prefix: '/api/v1' })
  await app.register(adminRoutes, { prefix: '/api/v1/admin' })

  const webIndex = join(settings.webPath, 'index.html')
  if (await fileExists(webIndex)) {
    const assets = join(settings.webPath, 'assets')
    if (await fileExists(assets)) {
      await app.register(fastifyStatic, { root: assets, prefix: '/assets/' })
    }
  }

  app.get('/api/openapi.json', async () => app.swagger())
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply
        .code(404)
        .send({ error: 'API endpoint was not found.', code: 'endpoint_not_found' })
    }
    if (!(await fileExists(webIndex))) {
      return reply
        .code(503)
        .type('text/plain')
        .send("The LibreTransfer web app is not built. Run 'pnpm build' and start the app again.")
    }
    return reply
      .type('text/html')
      .send(await import('node:fs/promises').then((fs) => fs.readFile(webIndex)))
  })

  const adminAdded = await seedAdmin(db, settings)
  await cleanupUploads(app)
  if (!db.get('SELECT id FROM users LIMIT 1')) {
    db.close()
    throw new Error('No user exists. Run `pnpm setup` or set LIBRETRANSFER_ADMIN_PASSWORD.')
  }
  if (adminAdded) app.log.info({ username: settings.adminUser }, 'Created the first admin user')

  app.addHook('onClose', async () => db.close())
  return app
}
