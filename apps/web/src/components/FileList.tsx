import {
  downloadUrl,
  type FileInfo,
  type FolderInfo,
  type SortDirection,
  type SortField,
} from '../api'
import { useText, type TextKey } from '../i18n'
import { Icon } from './Icon'
import { fileType, formatBytes, joinPath, type FileDialog } from './fileHelpers'

export function FileList({
  storageId,
  path,
  folder,
  pickedFiles,
  sortField,
  sortDirection,
  onOpen,
  onDialog,
  onPick,
  onPickPage,
  onSort,
  onCopyLink,
}: {
  storageId: string
  path: string
  folder: FolderInfo
  pickedFiles: Set<string>
  sortField: SortField
  sortDirection: SortDirection
  onOpen: (path: string) => void
  onDialog: (dialog: FileDialog) => void
  onPick: (name: string, picked: boolean) => void
  onPickPage: (picked: boolean) => void
  onSort: (field: SortField) => void
  onCopyLink: (item: FileInfo) => void
}) {
  const { text, language } = useText()
  const pagePicked =
    folder.items.length > 0 && folder.items.every((item) => pickedFiles.has(item.name))
  const somePicked = folder.items.some((item) => pickedFiles.has(item.name))

  return (
    <div className="file-table" role="table" aria-label={text('files')}>
      <div className="file-table-head" role="row">
        <span role="columnheader" className="check-cell">
          <input
            type="checkbox"
            checked={pagePicked}
            ref={(input) => {
              if (input) input.indeterminate = somePicked && !pagePicked
            }}
            aria-label={text('selectPage')}
            onChange={(event) => onPickPage(event.target.checked)}
          />
        </span>
        <SortHead
          field="name"
          label="name"
          current={sortField}
          direction={sortDirection}
          onSort={onSort}
        />
        <SortHead
          field="type"
          label="type"
          current={sortField}
          direction={sortDirection}
          onSort={onSort}
        />
        <SortHead
          field="size"
          label="size"
          current={sortField}
          direction={sortDirection}
          onSort={onSort}
        />
        <SortHead
          field="changed"
          label="changed"
          current={sortField}
          direction={sortDirection}
          onSort={onSort}
        />
        <span role="columnheader" className="actions-head">
          {text('actions')}
        </span>
      </div>
      {folder.items.map((item) => (
        <FileRow
          key={item.name}
          item={item}
          itemPath={joinPath(path, item.name)}
          storageId={storageId}
          canUpload={folder.can_upload}
          language={language}
          picked={pickedFiles.has(item.name)}
          onOpen={onOpen}
          onDialog={onDialog}
          onPick={(picked) => onPick(item.name, picked)}
          onCopyLink={() => onCopyLink(item)}
        />
      ))}
    </div>
  )
}

function SortHead({
  field,
  label,
  current,
  direction,
  onSort,
}: {
  field: SortField
  label: TextKey
  current: SortField
  direction: SortDirection
  onSort: (field: SortField) => void
}) {
  const { text } = useText()
  const active = current === field
  return (
    <span
      role="columnheader"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button className="sort-button" type="button" onClick={() => onSort(field)}>
        {text(label)}
        {active && <Icon name={direction === 'asc' ? 'sort-up' : 'sort-down'} size={16} />}
      </button>
    </span>
  )
}

function FileRow({
  item,
  itemPath,
  storageId,
  canUpload,
  language,
  picked,
  onOpen,
  onDialog,
  onPick,
  onCopyLink,
}: {
  item: FileInfo
  itemPath: string
  storageId: string
  canUpload: boolean
  language: string
  picked: boolean
  onOpen: (path: string) => void
  onDialog: (dialog: FileDialog) => void
  onPick: (picked: boolean) => void
  onCopyLink: () => void
}) {
  const { text } = useText()
  const typeLabel = fileType(item, text('folder'), text('file'))

  return (
    <div className={`file-row ${picked ? 'picked' : ''}`} role="row">
      <span role="cell" className="check-cell">
        <input
          type="checkbox"
          checked={picked}
          aria-label={text('selectItem', { name: item.name })}
          onChange={(event) => onPick(event.target.checked)}
        />
      </span>
      <button
        className="file-name"
        type="button"
        role="cell"
        onClick={() => item.is_folder && onOpen(itemPath)}
        disabled={!item.is_folder}
      >
        <span className={`file-icon ${item.is_folder ? 'folder' : ''}`}>
          <Icon name={item.is_folder ? 'folder' : 'file'} />
        </span>
        <span>
          <strong>{item.name}</strong>
          <small>{item.is_folder ? typeLabel : `${typeLabel} · ${formatBytes(item.size)}`}</small>
        </span>
      </button>
      <span className="file-type" role="cell">
        {typeLabel}
      </span>
      <span className="file-size" role="cell">
        {item.is_folder ? '—' : formatBytes(item.size)}
      </span>
      <time role="cell" dateTime={item.modified}>
        {new Intl.DateTimeFormat(language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(item.modified))}
      </time>
      <span className="row-actions" role="cell">
        {!item.is_folder && (
          <a
            className="action-button"
            href={downloadUrl(storageId, itemPath)}
            title={`${text('download')}: ${item.name}`}
            aria-label={`${text('download')}: ${item.name}`}
          >
            <Icon name="download" size={17} /> <span>{text('download')}</span>
          </a>
        )}
        {!item.is_folder && (
          <button
            className="action-button"
            type="button"
            title={`${text('copyLink')}: ${item.name}`}
            aria-label={`${text('copyLink')}: ${item.name}`}
            onClick={onCopyLink}
          >
            <Icon name="copy" size={17} /> <span>{text('copyLink')}</span>
          </button>
        )}
        {canUpload && (
          <button
            className="action-button"
            type="button"
            title={`${text('rename')}: ${item.name}`}
            aria-label={`${text('rename')}: ${item.name}`}
            onClick={() => onDialog({ kind: 'rename', item })}
          >
            <Icon name="edit" size={17} /> <span>{text('rename')}</span>
          </button>
        )}
        {canUpload && (
          <button
            className="action-button danger"
            type="button"
            title={`${text('delete')}: ${item.name}`}
            aria-label={`${text('delete')}: ${item.name}`}
            onClick={() => onDialog({ kind: 'delete', item })}
          >
            <Icon name="trash" size={17} /> <span>{text('delete')}</span>
          </button>
        )}
      </span>
    </div>
  )
}
