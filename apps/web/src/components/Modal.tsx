import { type ReactNode } from 'react'

import { useText } from '../i18n'

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { text } = useText()
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={text('close')}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
