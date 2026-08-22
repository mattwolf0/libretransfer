import { mkdir, readdir, realpath, rename, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import { AppError } from './errors.js'
import {
  checkInside,
  cleanFileName,
  PathLocks,
  pathExists,
  resolveFilePath,
  TrashFolder,
  UploadFolder,
} from './filePaths.js'
import type { Storage } from './models.js'

export interface FileItem {
  name: string
  is_folder: boolean
  size: number
  modified: string
}

interface FolderOptions {
  search: string
  sort: 'name' | 'type' | 'size' | 'changed'
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
}

export class FileStore {
  readonly locks = new PathLocks()

  async available(storage: Storage) {
    try {
      return (await stat(storage.path)).isDirectory()
    } catch {
      return false
    }
  }

  cleanName(rawName: unknown, showHidden: boolean) {
    return cleanFileName(rawName, showHidden)
  }

  resolvePath(
    storage: Storage,
    rawPath: unknown,
    options: { mustExist?: boolean; folder?: boolean } = {},
  ) {
    return resolveFilePath(storage, rawPath, options)
  }

  async listFolder(storage: Storage, rawPath: unknown, options: FolderOptions) {
    const directory = await this.resolvePath(storage, rawPath, { folder: true })
    const items: FileItem[] = []
    try {
      for (const entry of await readdir(directory.path, { withFileTypes: true })) {
        if (
          entry.name === TrashFolder ||
          entry.name === UploadFolder ||
          entry.name.startsWith('.upload-') ||
          (!storage.show_hidden && entry.name.startsWith('.')) ||
          entry.isSymbolicLink()
        ) {
          continue
        }
        try {
          const info = await stat(join(directory.path, entry.name))
          const isFolder = info.isDirectory()
          items.push({
            name: entry.name,
            is_folder: isFolder,
            size: isFolder ? 0 : info.size,
            modified: info.mtime.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
          })
        } catch {
          // A file can disappear while this folder is being read.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new AppError('The folder cannot be read.', 403, 'folder_forbidden')
      }
      throw error
    }

    const search = options.search.toLocaleLowerCase()
    const filtered = search
      ? items.filter((item) => item.name.toLocaleLowerCase().includes(search))
      : items
    const sorted = this.sortItems(filtered, options.sort, options.direction)
    const totalItems = sorted.length
    const totalPages = Math.max(1, Math.ceil(totalItems / options.pageSize))
    const start = (options.page - 1) * options.pageSize
    return {
      path: directory.relativePath,
      items: sorted.slice(start, start + options.pageSize),
      page: options.page,
      page_size: options.pageSize,
      total_items: totalItems,
      total_pages: totalPages,
    }
  }

  private sortItems(
    items: FileItem[],
    sort: FolderOptions['sort'],
    direction: FolderOptions['direction'],
  ) {
    const value = (item: FileItem) => {
      if (sort === 'type') {
        return item.is_folder ? 'folder' : extname(item.name).slice(1).toLocaleLowerCase() || 'file'
      }
      if (sort === 'size') return item.size
      if (sort === 'changed') return item.modified
      return item.name.toLocaleLowerCase()
    }
    const compare = (left: FileItem, right: FileItem) => {
      const a = value(left)
      const b = value(right)
      const result =
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      return direction === 'desc' ? -result : result
    }
    const byName = (left: FileItem, right: FileItem) => left.name.localeCompare(right.name)
    const folders = items
      .filter((item) => item.is_folder)
      .sort(byName)
      .sort(compare)
    const files = items
      .filter((item) => !item.is_folder)
      .sort(byName)
      .sort(compare)
    return [...folders, ...files]
  }

  async makeFolder(storage: Storage, rawParent: unknown, rawName: unknown) {
    this.checkWrite(storage)
    const name = this.cleanName(rawName, Boolean(storage.show_hidden))
    const parent = await this.resolvePath(storage, rawParent, { folder: true })
    const folder = join(parent.path, name)
    checkInside(parent.root, folder)
    return this.locks.use(folder, async () => {
      try {
        await mkdir(folder)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new AppError('A file or folder with this name already exists.', 409, 'file_exists')
        }
        throw error
      }
      return [parent.relativePath, name].filter(Boolean).join('/')
    })
  }

  async rename(storage: Storage, rawPath: unknown, rawName: unknown) {
    this.checkWrite(storage)
    const source = await this.resolvePath(storage, rawPath)
    const name = this.cleanName(rawName, Boolean(storage.show_hidden))
    const targetPath = join(resolve(source.path, '..'), name)
    checkInside(source.root, targetPath)
    return this.locks.use(targetPath, async () => {
      if (await pathExists(targetPath)) {
        throw new AppError('A file or folder with this name already exists.', 409, 'file_exists')
      }
      await rename(source.path, targetPath)
      const parent = source.relativePath.includes('/')
        ? source.relativePath.slice(0, source.relativePath.lastIndexOf('/'))
        : ''
      return [parent, name].filter(Boolean).join('/')
    })
  }

  async moveToTrash(storage: Storage, rawPath: unknown) {
    this.checkWrite(storage)
    const source = await this.resolvePath(storage, rawPath)
    if (!source.relativePath) {
      throw new AppError('The storage root cannot be deleted.', 400, 'root_delete_forbidden')
    }
    const trash = join(source.root, TrashFolder)
    await mkdir(trash, { recursive: true })
    const trashName = `${randomUUID().replaceAll('-', '')}-${basename(source.path)}`
    await rename(source.path, join(trash, trashName))
    return {
      name: basename(source.path),
      oldPath: source.relativePath,
      trashPath: `${TrashFolder}/${trashName}`,
    }
  }

  async restore(storage: Storage, oldPath: string, trashPath: string) {
    this.checkWrite(storage)
    const root = await realpath(storage.path)
    const trash = resolve(root, TrashFolder)
    const source = resolve(root, trashPath)
    checkInside(trash, source)
    if (!(await pathExists(source))) {
      throw new AppError('The trash item was not found.', 404, 'trash_not_found')
    }
    const target = await this.resolvePath(storage, oldPath, { mustExist: false })
    if (await pathExists(target.path)) {
      throw new AppError('The original path is already in use.', 409, 'file_exists')
    }
    if (!(await stat(resolve(target.path, '..'))).isDirectory()) {
      throw new AppError('The original folder was not found.', 404, 'folder_not_found')
    }
    await rename(source, target.path)
    return target.relativePath
  }

  checkWrite(storage: Storage) {
    if (!storage.allow_upload) {
      throw new AppError('This storage is read-only.', 403, 'storage_read_only')
    }
  }
}
