import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { config as readEnv } from 'dotenv'
import { z } from 'zod'

function findAppRoot() {
  if (process.env.LIBRETRANSFER_ROOT) return resolve(process.env.LIBRETRANSFER_ROOT)

  let current = resolve(process.env.INIT_CWD ?? process.cwd())
  let builtAppRoot: string | undefined
  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    if (
      existsSync(resolve(current, 'package.json')) &&
      existsSync(resolve(current, 'dist', 'cli.js'))
    ) {
      builtAppRoot = current
    }
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return builtAppRoot ?? resolve(process.cwd())
}

const appRoot = findAppRoot()
readEnv({ path: resolve(appRoot, '.env'), quiet: true })

const booleanValue = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  )

const positiveInteger = z.coerce.number().int().min(1)

function readStringList(value: unknown, defaultList: string[]) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || !value.trim()) return defaultList
  try {
    const json: unknown = JSON.parse(value)
    if (Array.isArray(json) && json.every((item) => typeof item === 'string')) return json
  } catch {
    // A comma-separated value is also accepted for convenient local setup.
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readDatabasePath() {
  const envPath = process.env.LIBRETRANSFER_DATABASE_PATH
  if (envPath) return envPath
  const oldUrl = process.env.LIBRETRANSFER_DATABASE_URL
  if (oldUrl?.startsWith('sqlite:///')) return oldUrl.slice('sqlite:///'.length)
  return './data/libretransfer.db'
}

const settingsSchema = z
  .object({
    environment: z.enum(['development', 'test', 'production']).default('development'),
    host: z.string().min(1).default('127.0.0.1'),
    port: z.coerce.number().int().min(1).max(65_535).default(8000),
    databasePath: z.string().min(1).default('./data/libretransfer.db'),
    configPath: z.string().min(1).default('./config.json'),
    webPath: z.string().min(1).default('./apps/web/dist'),
    adminUser: z.string().trim().min(1).max(80).default('admin'),
    adminPassword: z.string().min(10).optional(),
    cookieName: z.string().trim().min(1).default('libretransfer_session'),
    cookieSecure: booleanValue.default(false),
    sessionHours: positiveInteger.default(12),
    maxUploadMb: positiveInteger.default(4096),
    uploadSessionHours: positiveInteger.default(24),
    freeSpaceReserveMb: z.coerce.number().int().min(0).default(256),
    loginAttempts: positiveInteger.default(5),
    lockoutSeconds: positiveInteger.default(300),
    allowedOrigins: z.array(z.string()).default(['http://localhost:5173', 'http://127.0.0.1:5173']),
    trustedHosts: z.array(z.string()).default(['localhost', '127.0.0.1', 'testserver']),
    logLevel: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((settings, context) => {
    if (settings.environment !== 'production') return
    if (!settings.cookieSecure) {
      context.addIssue({
        code: 'custom',
        path: ['cookieSecure'],
        message: 'Secure cookies are required in production.',
      })
    }
    if (settings.allowedOrigins.some((origin) => !origin.startsWith('https://'))) {
      context.addIssue({
        code: 'custom',
        path: ['allowedOrigins'],
        message: 'Production origins must use HTTPS.',
      })
    }
  })

export type Settings = z.infer<typeof settingsSchema> & {
  maxUploadBytes: number
  freeSpaceReserveBytes: number
}

export type SettingsOverrides = Partial<z.input<typeof settingsSchema>>

export function loadSettings(overrides: SettingsOverrides = {}): Settings {
  const raw = {
    environment: process.env.LIBRETRANSFER_ENVIRONMENT,
    host: process.env.LIBRETRANSFER_HOST,
    port: process.env.LIBRETRANSFER_PORT,
    databasePath: readDatabasePath(),
    configPath: process.env.LIBRETRANSFER_CONFIG_PATH,
    webPath: process.env.LIBRETRANSFER_WEB_PATH,
    adminUser: process.env.LIBRETRANSFER_ADMIN_USER,
    adminPassword: process.env.LIBRETRANSFER_ADMIN_PASSWORD || undefined,
    cookieName: process.env.LIBRETRANSFER_COOKIE_NAME,
    cookieSecure: process.env.LIBRETRANSFER_COOKIE_SECURE,
    sessionHours: process.env.LIBRETRANSFER_SESSION_HOURS,
    maxUploadMb: process.env.LIBRETRANSFER_MAX_UPLOAD_MB,
    uploadSessionHours: process.env.LIBRETRANSFER_UPLOAD_SESSION_HOURS,
    freeSpaceReserveMb: process.env.LIBRETRANSFER_FREE_SPACE_RESERVE_MB,
    loginAttempts: process.env.LIBRETRANSFER_LOGIN_ATTEMPTS,
    lockoutSeconds: process.env.LIBRETRANSFER_LOCKOUT_SECONDS,
    allowedOrigins: readStringList(process.env.LIBRETRANSFER_ALLOWED_ORIGINS, [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]),
    trustedHosts: readStringList(process.env.LIBRETRANSFER_TRUSTED_HOSTS, [
      'localhost',
      '127.0.0.1',
      'testserver',
    ]),
    logLevel: process.env.LIBRETRANSFER_LOG_LEVEL?.toLowerCase(),
    ...overrides,
  }
  const parsed = settingsSchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined)),
  )
  return {
    ...parsed,
    databasePath: resolve(appRoot, parsed.databasePath),
    configPath: resolve(appRoot, parsed.configPath),
    webPath: resolve(appRoot, parsed.webPath),
    maxUploadBytes: parsed.maxUploadMb * 1024 * 1024,
    freeSpaceReserveBytes: parsed.freeSpaceReserveMb * 1024 * 1024,
  }
}
