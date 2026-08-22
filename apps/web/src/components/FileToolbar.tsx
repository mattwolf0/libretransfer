import { useText } from '../i18n'
import { Icon } from './Icon'

export function FileToolbar({
  searchText,
  pickedCount,
  canUpload,
  onSearch,
  onCopy,
  onTrash,
  onClearPicked,
}: {
  searchText: string
  pickedCount: number
  canUpload: boolean
  onSearch: (value: string) => void
  onCopy: () => void
  onTrash: () => void
  onClearPicked: () => void
}) {
  const { text } = useText()

  return (
    <div className="file-tools">
      <label className="file-search">
        <span className="sr-only">{text('searchFiles')}</span>
        <Icon name="search" size={18} />
        <input
          type="search"
          value={searchText}
          placeholder={text('searchFiles')}
          onChange={(event) => onSearch(event.target.value)}
        />
        {searchText && (
          <button
            className="icon-button"
            type="button"
            title={text('clearSearch')}
            aria-label={text('clearSearch')}
            onClick={() => onSearch('')}
          >
            <Icon name="close" size={17} />
          </button>
        )}
      </label>

      {pickedCount > 0 && (
        <div className="bulk-actions" aria-live="polite">
          <strong>{text('selectedCount', { count: pickedCount })}</strong>
          <button className="secondary-button" type="button" onClick={onCopy}>
            <Icon name="copy" size={17} /> {text('copyLinks')}
          </button>
          {canUpload && (
            <button className="danger-text-button" type="button" onClick={onTrash}>
              <Icon name="trash" size={17} /> {text('moveToTrash')}
            </button>
          )}
          <button className="text-button" type="button" onClick={onClearPicked}>
            {text('clearSelection')}
          </button>
        </div>
      )}
    </div>
  )
}
