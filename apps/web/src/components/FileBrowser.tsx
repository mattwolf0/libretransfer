import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { loadFolder, type StorageInfo } from '../api'
import { useText } from '../i18n'
import { FileDialogs } from './FileDialogs'
import { FileBrowserHeader } from './FileBrowserHeader'
import { FileList } from './FileList'
import { FilePagination } from './FilePagination'
import { FileToolbar } from './FileToolbar'
import { Icon } from './Icon'
import { UploadBox } from './UploadBox'
import { useFileActions } from './useFileActions'
import { useFileSelection } from './useFileSelection'
import { useFileUploads } from './useFileUploads'
import { useFolderNavigation } from './useFolderNavigation'

export function FileBrowser({ csrf, storages }: { csrf: string; storages: StorageInfo[] }) {
  const { storageId = '' } = useParams()
  const navigation = useFolderNavigation()
  const {
    path,
    searchQuery,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    searchText,
    setSearchText,
    changeSearch,
    openFolder,
    changeSort,
  } = navigation
  const storage = storages.find((item) => item.id === storageId)
  const { text } = useText()
  const selectionKey = [
    storageId,
    path,
    searchQuery,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
  ].join('|')
  const { pickedFiles, setPickedFiles } = useFileSelection(selectionKey)
  const actions = useFileActions({ storageId, path, csrf, pickedFiles, setPickedFiles })
  const {
    dialog,
    name,
    note,
    setName,
    setNote,
    closeDialog,
    openDialog,
    saveDialog,
    removeItem,
    removePicked,
    writeLinks,
    refreshFolder,
  } = actions

  const folder = useQuery({
    queryKey: [
      'files',
      storageId,
      path,
      searchQuery,
      sortField,
      sortDirection,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      loadFolder(storageId, path, {
        search: searchQuery,
        sort: sortField,
        direction: sortDirection,
        page: currentPage,
        pageSize,
      }),
    enabled: Boolean(storage),
  })

  const uploads = useFileUploads({
    storageId,
    path,
    csrf,
    onDone: () => void refreshFolder(),
  })

  const pathParts = path.split('/').filter(Boolean)
  const crumbs = [
    { name: text('root'), path: '' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: pathParts.slice(0, index + 1).join('/'),
    })),
  ]

  if (!storage) {
    return (
      <section className="empty-page">
        <h1>{text('noStorage')}</h1>
      </section>
    )
  }

  const pickedItems = folder.data?.items.filter((item) => pickedFiles.has(item.name)) ?? []

  return (
    <section className="files-page">
      <FileBrowserHeader
        storage={storage}
        canUpload={folder.data?.can_upload ?? false}
        crumbs={crumbs}
        onOpen={(nextPath) => {
          openFolder(nextPath)
          setNote(null)
        }}
        onNewFolder={() => openDialog({ kind: 'folder' })}
      />

      {folder.data?.can_upload && (
        <UploadBox
          upload={uploads.uploadState}
          savedUploads={uploads.savedUploads}
          onFiles={uploads.start}
          onPause={uploads.pause}
          onContinue={uploads.continueUpload}
          onCancel={uploads.cancelCurrent}
          onCancelAll={uploads.cancelAll}
          onResume={(saved, file) => void uploads.resumeSaved(saved, file)}
          onCancelSaved={(saved) => {
            void uploads.cancelSaved(saved).catch((error: unknown) =>
              setNote({
                text: error instanceof Error ? error.message : text('changeFailed'),
                error: true,
              }),
            )
          }}
        />
      )}

      {note && (
        <p className={`status-note ${note.error ? 'error' : ''}`} role="status">
          {note.key ? text(note.key, note.values) : note.text}
        </p>
      )}

      <FileToolbar
        searchText={searchText}
        pickedCount={pickedFiles.size}
        canUpload={folder.data?.can_upload ?? false}
        onSearch={setSearchText}
        onCopy={() => void writeLinks(pickedItems)}
        onTrash={() => openDialog({ kind: 'bulk-delete', count: pickedFiles.size })}
        onClearPicked={() => setPickedFiles(new Set())}
      />

      <div className="file-card">
        {folder.isPending ? (
          <div className="table-note">{text('loading')}</div>
        ) : folder.isError ? (
          <div className="table-note error-note">
            <p>{folder.error.message}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void folder.refetch()}
            >
              {text('retry')}
            </button>
          </div>
        ) : folder.data.items.length === 0 ? (
          <div className="empty-folder">
            <span className="empty-icon">
              <Icon name={searchQuery ? 'search' : 'folder'} size={30} />
            </span>
            <h2>{text(searchQuery ? 'noSearchResults' : 'emptyFolder')}</h2>
            <p>{text(searchQuery ? 'noSearchNote' : 'emptyNote')}</p>
          </div>
        ) : (
          <FileList
            storageId={storageId}
            path={path}
            folder={folder.data}
            pickedFiles={pickedFiles}
            sortField={sortField}
            sortDirection={sortDirection}
            onOpen={openFolder}
            onDialog={openDialog}
            onPick={(itemName, picked) =>
              setPickedFiles((current) => {
                const next = new Set(current)
                if (picked) next.add(itemName)
                else next.delete(itemName)
                return next
              })
            }
            onPickPage={(picked) =>
              setPickedFiles(
                picked ? new Set(folder.data.items.map((item) => item.name)) : new Set(),
              )
            }
            onSort={changeSort}
            onCopyLink={(item) => void writeLinks([item])}
          />
        )}
      </div>

      {folder.data && (
        <FilePagination
          page={folder.data.page}
          pageSize={folder.data.page_size}
          totalItems={folder.data.total_items}
          totalPages={folder.data.total_pages}
          onPage={(page) => changeSearch({ page })}
          onPageSize={(size) => changeSearch({ pageSize: size, page: null })}
        />
      )}

      <FileDialogs
        dialog={dialog}
        name={name}
        onName={setName}
        onClose={closeDialog}
        onSave={saveDialog}
        onDelete={() => {
          if (dialog?.kind === 'delete') removeItem(dialog.item)
          if (dialog?.kind === 'bulk-delete') void removePicked()
        }}
      />
    </section>
  )
}
