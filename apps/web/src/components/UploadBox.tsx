import { useRef, useState } from 'react'

import { useText, type TextKey } from '../i18n'
import { Icon } from './Icon'
import type { SavedUpload } from './uploadResume'
import type { UploadState } from './uploadTypes'

const statusKeys: Record<UploadState['status'], TextKey> = {
  preparing: 'uploadPreparing',
  uploading: 'uploading',
  paused: 'uploadPaused',
  completed: 'uploadCompleted',
  cancelled: 'uploadCancelled',
  failed: 'uploadFailed',
}

export function UploadBox({
  upload,
  savedUploads,
  onFiles,
  onPause,
  onContinue,
  onCancel,
  onCancelAll,
  onResume,
  onCancelSaved,
}: {
  upload: UploadState | null
  savedUploads: SavedUpload[]
  onFiles: (files: File[]) => void
  onPause: () => void
  onContinue: () => void
  onCancel: () => void
  onCancelAll: () => void
  onResume: (saved: SavedUpload, file: File) => void
  onCancelSaved: (saved: SavedUpload) => void
}) {
  const { text } = useText()
  const input = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedSavedUpload, setSelectedSavedUpload] = useState<SavedUpload | null>(null)
  const active = upload?.status === 'preparing' || upload?.status === 'uploading'
  const waiting = upload?.status === 'paused' || (upload?.status === 'failed' && upload.canContinue)
  const busy = active || waiting

  function pick(files: FileList | null) {
    if (files?.length) onFiles(Array.from(files))
  }

  return (
    <div className="upload-area">
      <div
        className={`upload-box ${dragging ? 'dragging' : ''} ${busy ? 'disabled' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!busy) pick(event.dataTransfer.files)
        }}
      >
        <input
          ref={input}
          className="hidden-input"
          type="file"
          multiple
          disabled={busy}
          onChange={(event) => {
            pick(event.target.files)
            event.target.value = ''
          }}
        />
        <span className="upload-icon">
          <Icon name="upload" size={24} />
        </span>
        <div>
          <strong>
            {upload
              ? text('uploadRunning', {
                  name: upload.name,
                  progress: upload.progress,
                })
              : text('upload')}
          </strong>
          <p>
            {upload
              ? `${text(statusKeys[upload.status])}${upload.error ? ` · ${upload.error}` : ''}`
              : text('uploadDrop')}
          </p>
          {upload && upload.queued > 0 && (
            <small>{text('queuedFiles', { count: upload.queued })}</small>
          )}
        </div>
        <div className="upload-actions">
          {!busy && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => input.current?.click()}
            >
              {text('chooseFiles')}
            </button>
          )}
          {upload?.status === 'uploading' && (
            <button className="secondary-button" type="button" onClick={onPause}>
              <Icon name="pause" size={17} /> {text('pause')}
            </button>
          )}
          {waiting && (
            <button className="secondary-button" type="button" onClick={onContinue}>
              <Icon name="play" size={17} /> {text('continue')}
            </button>
          )}
          {busy && (
            <button className="danger-text-button" type="button" onClick={onCancel}>
              <Icon name="close" size={17} /> {text('cancelUpload')}
            </button>
          )}
          {busy && upload.queued > 0 && (
            <button className="text-button" type="button" onClick={onCancelAll}>
              {text('cancelAll')}
            </button>
          )}
        </div>
        {upload && (
          <span
            className="upload-progress"
            style={{ width: `${upload.progress}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {savedUploads.length > 0 && (
        <div className="saved-uploads">
          <strong>{text('uploadsToContinue')}</strong>
          {savedUploads.map((saved) => (
            <div key={saved.id}>
              <span>
                {saved.name} · {Math.round((saved.offset / Math.max(saved.size, 1)) * 100)}%
              </span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSelectedSavedUpload(saved)
                  resumeInput.current?.click()
                }}
              >
                <Icon name="play" size={16} /> {text('continue')}
              </button>
              <button className="text-button" type="button" onClick={() => onCancelSaved(saved)}>
                {text('cancel')}
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={resumeInput}
        className="hidden-input"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (selectedSavedUpload && file) onResume(selectedSavedUpload, file)
          event.target.value = ''
          setSelectedSavedUpload(null)
        }}
      />
    </div>
  )
}
