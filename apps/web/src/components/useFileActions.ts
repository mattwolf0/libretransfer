import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type SetStateAction } from 'react'

import {
  ApiError,
  downloadUrl,
  makeFolder,
  renameFile,
  trashFile,
  trashFiles,
  type FileInfo,
} from '../api'
import { useText, type TextKey } from '../i18n'
import { joinPath, type FileDialog } from './fileHelpers'

type Note = {
  key?: TextKey
  values?: Record<string, string | number>
  text?: string
  error?: boolean
}

export function useFileActions({
  storageId,
  path,
  csrf,
  pickedFiles,
  setPickedFiles,
}: {
  storageId: string
  path: string
  csrf: string
  pickedFiles: Set<string>
  setPickedFiles: (files: SetStateAction<Set<string>>) => void
}) {
  const { text } = useText()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<FileDialog | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState<Note | null>(null)

  const change = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => refreshFolder(),
    onError: (error) => {
      setNote({
        ...(error instanceof ApiError ? { text: error.message } : { key: 'changeFailed' }),
        error: true,
      })
    },
  })

  function refreshFolder() {
    return queryClient.invalidateQueries({ queryKey: ['files', storageId, path] })
  }

  function openDialog(next: FileDialog) {
    setDialog(next)
    setName(next.kind === 'rename' ? next.item.name : '')
  }

  function saveDialog() {
    if (!dialog || !name.trim()) return
    if (dialog.kind === 'folder') {
      change.mutate(() => makeFolder(storageId, path, name.trim(), csrf), {
        onSuccess: () => setNote({ key: 'folderMade' }),
      })
    } else if (dialog.kind === 'rename') {
      change.mutate(
        () => renameFile(storageId, joinPath(path, dialog.item.name), name.trim(), csrf),
        { onSuccess: () => setNote({ key: 'renamed' }) },
      )
    }
    setDialog(null)
  }

  function removeItem(item: FileInfo) {
    change.mutate(() => trashFile(storageId, joinPath(path, item.name), csrf), {
      onSuccess: () => {
        setPickedFiles((current) => {
          const next = new Set(current)
          next.delete(item.name)
          return next
        })
        setNote({ key: 'movedToTrash' })
      },
    })
    setDialog(null)
  }

  async function removePicked() {
    if (!pickedFiles.size) return
    setDialog(null)
    try {
      const paths = [...pickedFiles].map((itemName) => joinPath(path, itemName))
      const result = await trashFiles(storageId, paths, csrf)
      const failedNames = result.failed.map((item) => item.path.split('/').at(-1)).join(', ')
      setPickedFiles(new Set(result.failed.map((item) => item.path.split('/').at(-1) ?? item.path)))
      setNote({
        key: 'bulkTrashResult',
        values: {
          moved: result.moved.length,
          failed: result.failed.length,
          names: failedNames || '—',
        },
        error: result.failed.length > 0,
      })
      await refreshFolder()
    } catch (error) {
      setNote({
        text: error instanceof Error ? error.message : text('changeFailed'),
        error: true,
      })
    }
  }

  async function writeLinks(items: FileInfo[]) {
    const files = items.filter((item) => !item.is_folder)
    if (!files.length) {
      setNote({ key: 'noFileLinks', error: true })
      return
    }
    const links = files
      .map(
        (item) =>
          new URL(downloadUrl(storageId, joinPath(path, item.name)), window.location.origin),
      )
      .join('\n')
    try {
      await navigator.clipboard.writeText(links)
      setNote({ key: files.length === 1 ? 'linkCopied' : 'linksCopied' })
    } catch {
      setNote({ key: 'copyFailed', error: true })
    }
  }

  return {
    dialog,
    name,
    note,
    setName,
    setNote,
    closeDialog: () => setDialog(null),
    openDialog,
    saveDialog,
    removeItem,
    removePicked,
    writeLinks,
    refreshFolder,
  }
}
