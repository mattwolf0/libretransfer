import { jsonOptions, request } from './client'
import {
  actionSchema,
  bulkTrashSchema,
  folderSchema,
  type SortDirection,
  type SortField,
} from './schemas'

type FolderQuery = {
  search?: string
  sort?: SortField
  direction?: SortDirection
  page?: number
  pageSize?: number
}

export function loadFolder(storage: string, path: string, options: FolderQuery = {}) {
  const query = new URLSearchParams({
    storage,
    path,
    search: options.search ?? '',
    sort: options.sort ?? 'name',
    direction: options.direction ?? 'asc',
    page: String(options.page ?? 1),
    page_size: String(options.pageSize ?? 50),
  })
  return request(`/api/v1/files?${query.toString()}`, folderSchema)
}

export function makeFolder(storage: string, path: string, name: string, csrf: string) {
  return request(
    '/api/v1/folders',
    actionSchema,
    jsonOptions('POST', { storage, path, name }, csrf),
  )
}

export function renameFile(storage: string, path: string, name: string, csrf: string) {
  return request(
    '/api/v1/files/rename',
    actionSchema,
    jsonOptions('POST', { storage, path, name }, csrf),
  )
}

export function trashFile(storage: string, path: string, csrf: string) {
  const query = new URLSearchParams({ storage, path })
  return request(`/api/v1/files?${query.toString()}`, actionSchema, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrf },
  })
}

export function trashFiles(storage: string, paths: string[], csrf: string) {
  return request(
    '/api/v1/files/bulk-trash',
    bulkTrashSchema,
    jsonOptions('POST', { storage, paths }, csrf),
  )
}

export function downloadUrl(storage: string, path: string) {
  const query = new URLSearchParams({ storage, path })
  return `/api/v1/files/download?${query.toString()}`
}
