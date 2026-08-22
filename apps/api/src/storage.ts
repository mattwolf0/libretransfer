import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { z } from 'zod'

import type { AppDatabase } from './database.js'
import { AppError } from './errors.js'
import type { Storage, StorageMember, User } from './models.js'

const folderSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/u),
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(1000),
  allow_upload: z.boolean().default(true),
  show_hidden: z.boolean().default(false),
  create_if_missing: z.boolean().default(false),
})

const storageConfigSchema = z
  .object({
    folders: z.array(folderSchema).min(1),
  })
  .superRefine((config, context) => {
    const ids = new Set<string>()
    for (const [index, folder] of config.folders.entries()) {
      if (ids.has(folder.id)) {
        context.addIssue({
          code: 'custom',
          path: ['folders', index, 'id'],
          message: 'Storage IDs must be unique.',
        })
      }
      ids.add(folder.id)
    }
  })

export interface StorageAccess {
  storage: Storage
  canUpload: boolean
}

export async function loadStorages(configPath: string) {
  let value: unknown
  try {
    value = JSON.parse(await readFile(configPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Storage config was not found: ${configPath}`, { cause: error })
    }
    throw new Error(`Storage config could not be read: ${configPath}`, { cause: error })
  }
  const config = storageConfigSchema.parse(value)
  const paths = new Set<string>()
  const storages: Storage[] = []
  for (const folder of config.folders) {
    const path = resolve(dirname(configPath), folder.path)
    const pathKey = process.platform === 'win32' ? path.toLocaleLowerCase() : path
    if (paths.has(pathKey)) throw new Error(`Storage path is used more than once: ${path}`)
    paths.add(pathKey)
    if (folder.create_if_missing) await mkdir(path, { recursive: true })
    storages.push({
      id: folder.id,
      name: folder.name,
      path,
      allow_upload: folder.allow_upload ? 1 : 0,
      show_hidden: folder.show_hidden ? 1 : 0,
    })
  }
  return storages.sort((left, right) => left.name.localeCompare(right.name))
}

export function listStorages(storages: Storage[], db: AppDatabase, user: User): StorageAccess[] {
  if (user.role === 'admin') {
    return storages.map((storage) => ({
      storage,
      canUpload: Boolean(storage.allow_upload),
    }))
  }
  const access = new Map(
    db
      .all<StorageMember>('SELECT * FROM storage_members WHERE user_id = ?', user.id)
      .map((item) => [item.storage_id, item]),
  )
  return storages.flatMap((storage) => {
    const member = access.get(storage.id)
    return member
      ? [{ storage, canUpload: Boolean(storage.allow_upload && member.can_upload) }]
      : []
  })
}

export function getStorage(
  storages: Storage[],
  db: AppDatabase,
  user: User,
  storageId: string,
  write = false,
) {
  const storage = storages.find((item) => item.id === storageId)
  if (!storage) throw new AppError('Storage was not found.', 404, 'storage_not_found')
  if (user.role === 'admin') {
    if (write && !storage.allow_upload) {
      throw new AppError('This storage is read-only.', 403, 'storage_read_only')
    }
    return storage
  }
  const access = db.get<StorageMember>(
    'SELECT * FROM storage_members WHERE storage_id = ? AND user_id = ?',
    storage.id,
    user.id,
  )
  if (!access) throw new AppError('You cannot open this storage.', 403, 'storage_forbidden')
  if (write && (!storage.allow_upload || !access.can_upload)) {
    throw new AppError('You cannot change files in this storage.', 403, 'storage_read_only')
  }
  return storage
}
