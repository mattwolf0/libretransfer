import { z } from 'zod'

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  username: z.string().optional(),
  csrf: z.string().optional(),
})

export const storageSchema = z.object({
  id: z.string(),
  name: z.string(),
  can_upload: z.boolean(),
  available: z.boolean(),
})

export const storagesSchema = z.object({
  storages: z.array(storageSchema),
})

export const fileSchema = z.object({
  name: z.string(),
  is_folder: z.boolean(),
  size: z.number(),
  modified: z.string(),
})

export const folderSchema = z.object({
  storage: z.string(),
  path: z.string(),
  can_upload: z.boolean(),
  items: z.array(fileSchema),
  page: z.number(),
  page_size: z.number(),
  total_items: z.number(),
  total_pages: z.number(),
})

export const actionSchema = z.object({ ok: z.boolean() }).passthrough()

export const bulkTrashSchema = z.object({
  ok: z.boolean(),
  moved: z.array(z.object({ path: z.string(), trash_id: z.number() })),
  failed: z.array(z.object({ path: z.string(), error: z.string(), code: z.string() })),
})

export const uploadSessionSchema = z.object({
  id: z.string(),
  storage: z.string(),
  path: z.string(),
  name: z.string(),
  size: z.number(),
  offset: z.number(),
  expires_at: z.string(),
})

export const uploadChunkSchema = z.object({ ok: z.boolean(), offset: z.number() })

export type SessionInfo = z.infer<typeof sessionSchema>
export type StorageInfo = z.infer<typeof storageSchema>
export type FolderInfo = z.infer<typeof folderSchema>
export type FileInfo = z.infer<typeof fileSchema>
export type UploadSessionInfo = z.infer<typeof uploadSessionSchema>
export type SortField = 'name' | 'type' | 'size' | 'changed'
export type SortDirection = 'asc' | 'desc'
