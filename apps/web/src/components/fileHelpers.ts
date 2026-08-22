import type { FileInfo } from '../api'

export type FileDialog =
  | { kind: 'folder' }
  | { kind: 'rename'; item: FileInfo }
  | { kind: 'delete'; item: FileInfo }
  | { kind: 'bulk-delete'; count: number }

export function joinPath(left: string, right: string) {
  return [left, right].filter(Boolean).join('/')
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}

export function fileType(item: Pick<FileInfo, 'name' | 'is_folder'>, folder: string, file: string) {
  if (item.is_folder) return folder
  const dot = item.name.lastIndexOf('.')
  if (dot <= 0 || dot === item.name.length - 1) return file
  return item.name.slice(dot + 1).toUpperCase()
}
