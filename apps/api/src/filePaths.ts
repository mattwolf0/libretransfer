import { lstat, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

import { AppError } from './errors.js'
import type { Storage } from './models.js'

export const TrashFolder = '.libretransfer-trash'
export const UploadFolder = '.libretransfer-uploads'

const windowsReservedNames = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

// eslint-disable-next-line no-control-regex
const invalidName = /[<>:"/\\|?*\u0000-\u001f]/u

export class PathLocks {
  private readonly tails = new Map<string, Promise<void>>()

  async use<T>(path: string, work: () => Promise<T>) {
    const key = normalize(path).toLocaleLowerCase()
    const previous = this.tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock
    })
    const tail = previous.then(() => current)
    this.tails.set(key, tail)
    await previous
    try {
      return await work()
    } finally {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}

export async function pathExists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function checkInside(root: string, fullPath: string) {
  const offset = relative(root, fullPath)
  if (offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))) {
    return
  }
  throw new AppError('The path is not valid.', 403, 'path_invalid')
}

export function cleanFileName(rawName: unknown, showHidden: boolean) {
  const name = String(rawName).normalize('NFC').trim()
  if (!name || name === '.' || name === '..') {
    throw new AppError('The name cannot be empty.', 400, 'name_invalid')
  }
  if ([...name].length > 180) {
    throw new AppError('The name can contain at most 180 characters.', 400, 'name_too_long')
  }
  if (
    name.endsWith('.') ||
    name.endsWith(' ') ||
    invalidName.test(name) ||
    basename(name) !== name
  ) {
    throw new AppError('The name is not valid.', 400, 'name_invalid')
  }
  if (windowsReservedNames.has((name.split('.')[0] ?? '').toUpperCase())) {
    throw new AppError('This name is reserved on Windows.', 400, 'name_reserved')
  }
  if (name.startsWith('.upload-') || name === TrashFolder || name === UploadFolder) {
    throw new AppError('This name is reserved by LibreTransfer.', 400, 'name_reserved')
  }
  if (!showHidden && name.startsWith('.')) {
    throw new AppError('Hidden names are not allowed here.', 400, 'hidden_name')
  }
  return name
}

function cleanFilePath(rawPath: unknown, showHidden: boolean) {
  const text = (typeof rawPath === 'string' ? rawPath : '')
    .normalize('NFC')
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/gu, '')
  if (!text) return { relativePath: '', parts: [] as string[] }

  const parts: string[] = []
  for (const part of text.split('/')) {
    if (!part || part === '.') continue
    if (part === '..' || part.includes('\0')) {
      throw new AppError('The path is not valid.', 403, 'path_invalid')
    }
    if (part === TrashFolder || part === UploadFolder || (!showHidden && part.startsWith('.'))) {
      throw new AppError('This path cannot be opened.', 403, 'path_forbidden')
    }
    parts.push(part)
  }
  return { relativePath: parts.join('/'), parts }
}

export async function resolveFilePath(
  storage: Storage,
  rawPath: unknown,
  options: { mustExist?: boolean; folder?: boolean } = {},
) {
  const mustExist = options.mustExist ?? true
  let root: string
  try {
    root = await realpath(storage.path)
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new AppError(
      `The '${storage.name}' storage is not available.`,
      404,
      'storage_unavailable',
    )
  }

  const cleaned = cleanFilePath(rawPath, Boolean(storage.show_hidden))
  const fullPath = resolve(root, ...cleaned.parts)
  checkInside(root, fullPath)

  let current = root
  for (const part of cleaned.parts) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) {
        throw new AppError('Symbolic links cannot be opened.', 403, 'symlink_forbidden')
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      break
    }
  }

  const exists = await pathExists(fullPath)
  if (mustExist && !exists) {
    throw new AppError('File or folder was not found.', 404, 'file_not_found')
  }
  if (exists) {
    const info = await stat(fullPath)
    if (options.folder === true && !info.isDirectory()) {
      throw new AppError('This path is not a folder.', 400, 'folder_expected')
    }
    if (options.folder === false && !info.isFile()) {
      throw new AppError('This path is not a file.', 400, 'file_expected')
    }
  }
  return { path: fullPath, relativePath: cleaned.relativePath, root }
}
