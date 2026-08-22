import { useEffect, useRef, useState } from 'react'

import {
  ApiError,
  cancelUpload,
  finishUpload,
  loadUpload,
  startUpload,
  uploadChunk,
  type UploadSessionInfo,
  type UploadTask,
} from '../api'
import { matchesFile, type SavedUpload } from './uploadResume'
import type { CurrentUpload, UploadState } from './uploadTypes'
import { useSavedUploads } from './useSavedUploads'

const chunkSize = 5 * 1024 * 1024

export function useFileUploads({
  storageId,
  path,
  csrf,
  onDone,
}: {
  storageId: string
  path: string
  csrf: string
  onDone: () => void
}) {
  const scope = `${storageId}\0${path}`
  const [scopedUpload, setScopedUpload] = useState<{
    scope: string
    upload: UploadState | null
  }>({
    scope,
    upload: null,
  })
  const queue = useRef<File[]>([])
  const current = useRef<CurrentUpload | null>(null)
  const currentTask = useRef<UploadTask<number> | null>(null)
  const stop = useRef<'pause' | 'cancel-current' | 'cancel-all' | null>(null)
  const running = useRef(false)
  const folderVersion = useRef(0)
  const uploadState = scopedUpload.scope === scope ? scopedUpload.upload : null

  function showUpload(nextUpload: UploadState | null) {
    setScopedUpload({ scope, upload: nextUpload })
  }

  useEffect(() => {
    folderVersion.current += 1
    const version = folderVersion.current
    return () => {
      if (folderVersion.current === version) folderVersion.current += 1
      currentTask.current?.cancel()
      currentTask.current = null
      current.current = null
      queue.current = []
      running.current = false
      stop.current = null
    }
  }, [storageId, path])

  const saved = useSavedUploads(storageId, path)
  const { saveForResume, forgetUpload } = saved

  async function startNextFile(version: number) {
    const file = queue.current.shift()
    if (!file || version !== folderVersion.current) {
      running.current = false
      if (!file) onDone()
      return
    }
    showUpload({
      name: file.name,
      progress: 0,
      status: 'preparing',
      queued: queue.current.length,
    })
    try {
      const session = await startUpload(storageId, path, file, csrf)
      if (version !== folderVersion.current) return
      saveForResume(file, session)
      await uploadFile(file, session, version)
    } catch (error) {
      if (version !== folderVersion.current) return
      running.current = false
      showUpload({
        name: file.name,
        progress: 0,
        status: 'failed',
        queued: queue.current.length,
        error: error instanceof Error ? error.message : 'The upload failed.',
        canContinue: false,
      })
    }
  }

  async function uploadFile(file: File, firstSession: UploadSessionInfo, version: number) {
    current.current = { file, session: firstSession }
    running.current = true
    let session = firstSession
    try {
      if (stop.current) throw new ApiError('The upload was cancelled.', 'upload_cancelled')
      while (session.offset < file.size) {
        const start = session.offset
        const part = file.slice(start, Math.min(start + chunkSize, file.size))
        showUpload({
          name: file.name,
          progress: Math.round((start / file.size) * 100),
          status: 'uploading',
          queued: queue.current.length,
        })
        const task = uploadChunk(session.id, start, part, csrf, (sent) => {
          if (version !== folderVersion.current) return
          showUpload({
            name: file.name,
            progress: Math.round(((start + sent) / file.size) * 100),
            status: 'uploading',
            queued: queue.current.length,
          })
        })
        currentTask.current = task
        const offset = await task.promise
        currentTask.current = null
        session = { ...session, offset }
        current.current = { file, session }
        saveForResume(file, session)
        if (stop.current) throw new ApiError('The upload was cancelled.', 'upload_cancelled')
      }
      await finishUpload(session.id, csrf)
      forgetUpload(session.id)
      current.current = null
      currentTask.current = null
      showUpload({
        name: file.name,
        progress: 100,
        status: 'completed',
        queued: queue.current.length,
      })
      if (queue.current.length) await startNextFile(version)
      else {
        running.current = false
        onDone()
      }
    } catch (error) {
      if (version !== folderVersion.current) return
      currentTask.current = null
      const stopped = stop.current
      if (error instanceof ApiError && error.code === 'upload_cancelled' && stopped) {
        if (stopped === 'pause') {
          running.current = false
          showUpload({
            name: file.name,
            progress: Math.round((session.offset / Math.max(file.size, 1)) * 100),
            status: 'paused',
            queued: queue.current.length,
          })
          return
        }
        await cancelUpload(session.id, csrf)
        forgetUpload(session.id)
        current.current = null
        running.current = false
        showUpload({
          name: file.name,
          progress: 0,
          status: 'cancelled',
          queued: queue.current.length,
        })
        stop.current = null
        if (stopped === 'cancel-current' && queue.current.length) await startNextFile(version)
        else onDone()
        return
      }
      running.current = false
      showUpload({
        name: file.name,
        progress: Math.round((session.offset / Math.max(file.size, 1)) * 100),
        status: 'failed',
        queued: queue.current.length,
        error: error instanceof Error ? error.message : 'The upload failed.',
        canContinue: true,
      })
    }
  }

  function start(files: File[]) {
    if (running.current || current.current || !files.length) return
    queue.current = [...files]
    running.current = true
    stop.current = null
    void startNextFile(folderVersion.current)
  }

  function pause() {
    if (!running.current || !currentTask.current) return
    stop.current = 'pause'
    currentTask.current.cancel()
  }

  async function continueUpload() {
    if (running.current || !current.current) return
    const pausedUpload = current.current
    running.current = true
    stop.current = null
    showUpload({
      name: pausedUpload.file.name,
      progress: Math.round(
        (pausedUpload.session.offset / Math.max(pausedUpload.file.size, 1)) * 100,
      ),
      status: 'preparing',
      queued: queue.current.length,
    })
    try {
      const session = await loadUpload(pausedUpload.session.id)
      current.current = { file: pausedUpload.file, session }
      await uploadFile(pausedUpload.file, session, folderVersion.current)
    } catch (error) {
      running.current = false
      showUpload({
        name: pausedUpload.file.name,
        progress: 0,
        status: 'failed',
        queued: queue.current.length,
        error: error instanceof Error ? error.message : 'The upload cannot continue.',
        canContinue: true,
      })
    }
  }

  function cancelCurrent() {
    stop.current = 'cancel-current'
    if (currentTask.current) currentTask.current.cancel()
    else if (current.current && !running.current)
      void cancelStopped(current.current, 'cancel-current')
  }

  function cancelAll() {
    queue.current = []
    if (!current.current && !running.current) {
      showUpload(null)
      return
    }
    stop.current = 'cancel-all'
    if (currentTask.current) currentTask.current.cancel()
    else if (current.current && !running.current) void cancelStopped(current.current, 'cancel-all')
  }

  async function cancelStopped(activeUpload: CurrentUpload, mode: 'cancel-current' | 'cancel-all') {
    await cancelUpload(activeUpload.session.id, csrf)
    forgetUpload(activeUpload.session.id)
    current.current = null
    running.current = false
    showUpload({
      name: activeUpload.file.name,
      progress: 0,
      status: 'cancelled',
      queued: queue.current.length,
    })
    if (mode === 'cancel-current' && queue.current.length)
      await startNextFile(folderVersion.current)
    else onDone()
  }

  async function resumeSaved(savedUpload: SavedUpload, file: File) {
    if (running.current || current.current) return
    if (!matchesFile(savedUpload, file)) {
      showUpload({
        name: savedUpload.name,
        progress: 0,
        status: 'failed',
        queued: 0,
        error: 'Choose the same file that was used before.',
        canContinue: false,
      })
      return
    }
    try {
      running.current = true
      stop.current = null
      const session = await loadUpload(savedUpload.id)
      saveForResume(file, session)
      await uploadFile(file, session, folderVersion.current)
    } catch (error) {
      running.current = false
      if (error instanceof ApiError && ['upload_not_found', 'upload_expired'].includes(error.code))
        forgetUpload(savedUpload.id)
      showUpload({
        name: savedUpload.name,
        progress: 0,
        status: 'failed',
        queued: 0,
        error: error instanceof Error ? error.message : 'The upload cannot continue.',
        canContinue: false,
      })
    }
  }

  async function cancelSaved(savedUpload: SavedUpload) {
    try {
      await cancelUpload(savedUpload.id, csrf)
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        !['upload_not_found', 'upload_expired'].includes(error.code)
      )
        throw error
    }
    forgetUpload(savedUpload.id)
  }

  return {
    uploadState,
    savedUploads: saved.savedUploads,
    start,
    pause,
    continueUpload,
    cancelCurrent,
    cancelAll,
    resumeSaved,
    cancelSaved,
  }
}
