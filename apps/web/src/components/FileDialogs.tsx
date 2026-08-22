import { useText } from '../i18n'
import { type FileDialog } from './fileHelpers'
import { Modal } from './Modal'

export function FileDialogs({
  dialog,
  name,
  onName,
  onClose,
  onSave,
  onDelete,
}: {
  dialog: FileDialog | null
  name: string
  onName: (name: string) => void
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const { text } = useText()

  if (!dialog) return null
  if (dialog.kind === 'delete' || dialog.kind === 'bulk-delete') {
    const bulk = dialog.kind === 'bulk-delete'
    return (
      <Modal title={text('delete')} onClose={onClose}>
        <p>
          {bulk
            ? text('confirmBulkDelete', { count: dialog.count })
            : text('confirmDelete', { name: dialog.item.name })}
        </p>
        <p className="muted">{text('deleteNote')}</p>
        <div className="modal-actions">
          <button className="text-button" type="button" onClick={onClose}>
            {text('cancel')}
          </button>
          <button className="danger-button" type="button" onClick={onDelete}>
            {text('delete')}
          </button>
        </div>
      </Modal>
    )
  }

  const isFolder = dialog.kind === 'folder'
  return (
    <Modal title={text(isFolder ? 'newFolder' : 'rename')} onClose={onClose}>
      <label className="modal-field">
        <span>{text(isFolder ? 'folderName' : 'name')}</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onSave()}
        />
      </label>
      <div className="modal-actions">
        <button className="text-button" type="button" onClick={onClose}>
          {text('cancel')}
        </button>
        <button className="primary-button" type="button" disabled={!name.trim()} onClick={onSave}>
          {text(isFolder ? 'create' : 'rename')}
        </button>
      </div>
    </Modal>
  )
}
