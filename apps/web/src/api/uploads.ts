import { z } from 'zod'

import { ApiError, jsonOptions, request } from './client'
import { actionSchema, uploadChunkSchema, uploadSessionSchema } from './schemas'

export type UploadTask<T> = {
  promise: Promise<T>
  cancel: () => void
}

export function startUpload(storage: string, path: string, file: File, csrf: string) {
  return request(
    '/api/v1/uploads',
    uploadSessionSchema,
    jsonOptions('POST', { storage, path, name: file.name, size: file.size }, csrf),
  )
}

export function loadUpload(uploadId: string) {
  return request(`/api/v1/uploads/${uploadId}`, uploadSessionSchema)
}

export function finishUpload(uploadId: string, csrf: string) {
  return request(`/api/v1/uploads/${uploadId}/finish`, actionSchema, jsonOptions('POST', {}, csrf))
}

export function cancelUpload(uploadId: string, csrf: string) {
  return request(`/api/v1/uploads/${uploadId}`, actionSchema, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrf },
  })
}

export function uploadChunk(
  uploadId: string,
  offset: number,
  chunk: Blob,
  csrf: string,
  onProgress: (sent: number) => void,
) {
  const upload = new XMLHttpRequest()
  const promise = new Promise<number>((resolve, reject) => {
    upload.open('PUT', `/api/v1/uploads/${uploadId}/chunk?offset=${offset}`)
    upload.setRequestHeader('X-CSRF-Token', csrf)
    upload.setRequestHeader('Content-Type', 'application/octet-stream')
    upload.upload.addEventListener('progress', (event) => onProgress(event.loaded))
    upload.addEventListener('load', () => {
      if (upload.status >= 200 && upload.status < 300) {
        try {
          const parsed = uploadChunkSchema.parse(JSON.parse(upload.responseText))
          resolve(parsed.offset)
        } catch {
          reject(
            new ApiError('The server returned an unknown upload response.', 'response_invalid'),
          )
        }
        return
      }
      try {
        const error = z
          .object({ error: z.string(), code: z.string().optional() })
          .parse(JSON.parse(upload.responseText))
        reject(new ApiError(error.error, error.code, upload.status))
      } catch {
        reject(new ApiError('The upload failed.', 'upload_failed', upload.status))
      }
    })
    upload.addEventListener('error', () =>
      reject(new ApiError('The upload connection failed.', 'network_error')),
    )
    upload.addEventListener('abort', () =>
      reject(new ApiError('The upload was cancelled.', 'upload_cancelled')),
    )
    upload.send(chunk)
  })
  return { promise, cancel: () => upload.abort() }
}
