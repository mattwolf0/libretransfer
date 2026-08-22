import type { StorageInfo } from '../api'
import { useText } from '../i18n'
import { Icon } from './Icon'

type Crumb = {
  name: string
  path: string
}

export function FileBrowserHeader({
  storage,
  canUpload,
  crumbs,
  onOpen,
  onNewFolder,
}: {
  storage: StorageInfo
  canUpload: boolean
  crumbs: Crumb[]
  onOpen: (path: string) => void
  onNewFolder: () => void
}) {
  const { text } = useText()

  return (
    <>
      <div className="page-heading">
        <div>
          {storage.name.localeCompare(text('files'), undefined, { sensitivity: 'base' }) !== 0 && (
            <p className="eyebrow">{text('files')}</p>
          )}
          <span className="title-line">
            <h1>{storage.name}</h1>
            <span className={`storage-state ${canUpload ? 'writable' : ''}`}>
              {canUpload ? text('writable') : text('readOnly')}
            </span>
          </span>
        </div>
        {canUpload && (
          <button className="primary-button" type="button" onClick={onNewFolder}>
            <Icon name="plus" /> <span>{text('newFolder')}</span>
          </button>
        )}
      </div>

      <nav className="breadcrumbs" aria-label={text('breadcrumb')}>
        {crumbs.map((crumb, index) => (
          <span key={crumb.path || 'root'}>
            {index > 0 && <Icon name="chevron" size={15} />}
            <button type="button" onClick={() => onOpen(crumb.path)}>
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
    </>
  )
}
