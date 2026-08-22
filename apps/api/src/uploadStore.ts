import { constants, link, lstat, mkdir, open, rename, stat, statfs, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { AppError } from './errors.js'
import { checkInside, pathExists, UploadFolder } from './filePaths.js'
import type { FileStore } from './fileStore.js'
import type { Storage } from './models.js'

export class UploadStore {
  constructor(
    private readonly files: FileStore,
    private readonly maxUploadBytes: number,
    private readonly freeSpaceReserveBytes: number,
  ) {}

  async prepareUpload(storage: Storage, rawDirectory: unknown, rawName: unknown, length: number) {
    this.files.checkWrite(storage)
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new AppError('The file size is not valid.', 400, 'size_invalid')
    }
    if (length > this.maxUploadBytes) {
      throw new AppError('The upload is too large.', 413, 'upload_too_large')
    }

    const name = this.files.cleanName(rawName, Boolean(storage.show_hidden))
    const directory = await this.files.resolvePath(storage, rawDirectory, { folder: true })
    const targetPath = join(directory.path, name)
    checkInside(directory.root, targetPath)
    if (await pathExists(targetPath)) {
      throw new AppError('A file or folder with this name already exists.', 409, 'file_exists')
    }
    const disk = await statfs(directory.path)
    if (disk.bavail * disk.bsize - length < this.freeSpaceReserveBytes) {
      throw new AppError('There is not enough free disk space.', 507, 'storage_full')
    }
    return {
      targetPath,
      relativePath: [directory.relativePath, name].filter(Boolean).join('/'),
    }
  }

  async createTempFile(storage: Storage, uploadId: string) {
    const root = await this.files.resolvePath(storage, '', { folder: true })
    const folder = join(root.path, UploadFolder)
    if (await pathExists(folder)) {
      const info = await lstat(folder)
      if (info.isSymbolicLink()) {
        throw new AppError('The upload folder is not safe.', 403, 'upload_folder_invalid')
      }
    }
    await mkdir(folder, { recursive: true })
    const tempFile = join(folder, `${uploadId}.upload`)
    const handle = await open(tempFile, 'wx')
    await handle.close()
    return tempFile
  }

  async getTempFile(storage: Storage, uploadId: string) {
    if (!/^[a-f0-9]{32}$/u.test(uploadId)) {
      throw new AppError('The upload session is not valid.', 400, 'upload_invalid')
    }
    const root = await this.files.resolvePath(storage, '', { folder: true })
    const tempFile = join(root.path, UploadFolder, `${uploadId}.upload`)
    checkInside(root.path, tempFile)
    return tempFile
  }

  async append(storage: Storage, uploadId: string, offset: number, chunk: Buffer) {
    const tempFile = await this.getTempFile(storage, uploadId)
    return this.files.locks.use(tempFile, async () => {
      let size: number
      try {
        size = (await stat(tempFile)).size
      } catch {
        throw new AppError('The upload data was not found.', 404, 'upload_data_missing')
      }
      if (size !== offset) {
        throw new AppError('The upload offset has changed.', 409, 'upload_offset_changed')
      }
      const handle = await open(tempFile, constants.O_WRONLY | constants.O_APPEND)
      try {
        await handle.write(chunk)
      } finally {
        await handle.close()
      }
      return offset + chunk.length
    })
  }

  async removeTempFile(storage: Storage, uploadId: string) {
    const tempFile = await this.getTempFile(storage, uploadId)
    await unlink(tempFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }

  async finishUpload(tempFile: string, targetPath: string) {
    return this.files.locks.use(targetPath, async () => {
      if (await pathExists(targetPath)) {
        throw new AppError('A file or folder with this name already exists.', 409, 'file_exists')
      }
      try {
        await link(tempFile, targetPath)
        await unlink(tempFile)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST' || (await pathExists(targetPath))) {
          throw new AppError('A file or folder with this name already exists.', 409, 'file_exists')
        }
        await rename(tempFile, targetPath)
      }
    })
  }
}
