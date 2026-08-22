import type { Settings } from './config.js'
import type { AppDatabase } from './database.js'
import type { FileStore } from './fileStore.js'
import type { Storage } from './models.js'
import type { UploadStore } from './uploadStore.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase
    settings: Settings
    storages: Storage[]
    files: FileStore
    uploads: UploadStore
  }
}
