import type { UploadSessionInfo } from '../api'

export type UploadState = {
  name: string
  progress: number
  status: 'preparing' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'failed'
  queued: number
  error?: string
  canContinue?: boolean
}

export type CurrentUpload = {
  file: File
  session: UploadSessionInfo
}
