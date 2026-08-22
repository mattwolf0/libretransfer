export interface User {
  id: number
  username: string
  password_hash: string
  role: 'admin' | 'member'
  active: number
  created_at: string
}

export interface LoginSession {
  id: number
  token_hash: string
  csrf_token: string
  user_id: number
  created_at: string
  expires_at: string
}

export interface LoginAttempt {
  key: string
  failures: number
  first_failed_at: string
  locked_until: string | null
}

export interface Storage {
  id: string
  name: string
  path: string
  allow_upload: number
  show_hidden: number
}

export interface StorageMember {
  id: number
  storage_id: string
  user_id: number
  can_upload: number
}

export interface TrashItem {
  id: number
  storage_id: string
  user_id: number
  name: string
  old_path: string
  trash_path: string
  deleted_at: string
}

export interface UploadSession {
  id: string
  storage_id: string
  user_id: number
  folder_path: string
  file_name: string
  file_size: number
  uploaded_size: number
  created_at: string
  updated_at: string
  expires_at: string
}

export function nowIso() {
  return new Date().toISOString()
}
