import { useState } from 'react'

import type { UploadSessionInfo } from '../api'
import { readSavedUploads, removeSavedUpload, saveUpload } from './uploadResume'

export function useSavedUploads(storageId: string, path: string) {
  const scope = `${storageId}\0${path}`
  const [savedUploads, setSavedUploads] = useState(readSavedUploads)
  const [activeUpload, setActiveUpload] = useState({ scope: '', id: '' })
  const activeUploadId = activeUpload.scope === scope ? activeUpload.id : ''

  function refreshSavedUploads() {
    setSavedUploads(readSavedUploads())
  }

  function saveForResume(file: File, session: UploadSessionInfo) {
    setActiveUpload({ scope, id: session.id })
    saveUpload({
      id: session.id,
      storage: session.storage,
      path: session.path,
      name: session.name,
      size: session.size,
      lastModified: file.lastModified,
      offset: session.offset,
      expiresAt: session.expires_at,
    })
    refreshSavedUploads()
  }

  function forgetUpload(uploadId: string) {
    removeSavedUpload(uploadId)
    setActiveUpload((upload) => (upload.id === uploadId ? { scope: '', id: '' } : upload))
    refreshSavedUploads()
  }

  return {
    savedUploads: savedUploads
      .filter((item) => item.storage === storageId && item.path === path)
      .filter((item) => item.id !== activeUploadId),
    saveForResume,
    forgetUpload,
  }
}
