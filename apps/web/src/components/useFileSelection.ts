import { useState, type SetStateAction } from 'react'

export function useFileSelection(key: string) {
  const [selection, setSelection] = useState<{ key: string; files: Set<string> }>({
    key: '',
    files: new Set(),
  })
  const pickedFiles = selection.key === key ? selection.files : new Set<string>()

  function setPickedFiles(nextFiles: SetStateAction<Set<string>>) {
    setSelection((current) => {
      const currentFiles = current.key === key ? current.files : new Set<string>()
      return {
        key,
        files: typeof nextFiles === 'function' ? nextFiles(currentFiles) : nextFiles,
      }
    })
  }

  return { pickedFiles, setPickedFiles }
}
