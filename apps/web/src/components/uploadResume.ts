export type SavedUpload = {
  id: string
  storage: string
  path: string
  name: string
  size: number
  lastModified: number
  offset: number
  expiresAt: string
}

const storageKey = 'libretransfer-uploads'

export function readSavedUploads() {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(items)) return []
    return items.filter(isSavedUpload)
  } catch {
    return []
  }
}

export function saveUpload(item: SavedUpload) {
  const otherUploads = readSavedUploads().filter((current) => current.id !== item.id)
  localStorage.setItem(storageKey, JSON.stringify([...otherUploads, item]))
}

export function removeSavedUpload(uploadId: string) {
  const remainingUploads = readSavedUploads().filter((item) => item.id !== uploadId)
  localStorage.setItem(storageKey, JSON.stringify(remainingUploads))
}

export function matchesFile(saved: SavedUpload, file: File) {
  return (
    saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified
  )
}

function isSavedUpload(value: unknown): value is SavedUpload {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.storage === 'string' &&
    typeof item.path === 'string' &&
    typeof item.name === 'string' &&
    typeof item.size === 'number' &&
    typeof item.lastModified === 'number' &&
    typeof item.offset === 'number' &&
    typeof item.expiresAt === 'string'
  )
}
