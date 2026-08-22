import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import type { SessionInfo, StorageInfo } from '../api'
import { useText } from '../i18n'
import { Icon } from './Icon'

type Theme = 'system' | 'light' | 'dark'

export function AppShell({
  session,
  storages,
  onLogout,
  children,
}: {
  session: SessionInfo
  storages: StorageInfo[]
  onLogout: () => void
  children: ReactNode
}) {
  const { language, setLanguage, text } = useText()
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('libretransfer-theme')
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system'
  })

  useEffect(() => {
    localStorage.setItem('libretransfer-theme', theme)
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  function nextTheme() {
    setTheme((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    )
  }

  return (
    <div className="app-frame">
      <header className="top-bar">
        <NavLink to="/" className="brand-link" aria-label={text('appName')}>
          <span className="brand-mark small" aria-hidden="true">
            <Icon name="transfer" size={26} />
          </span>
          <span>
            <strong>{text('appName')}</strong>
            <small>{text('appNote')}</small>
          </span>
        </NavLink>
        <div className="top-actions">
          <button
            className="text-button compact-button"
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'hu' : 'en')}
            aria-label={text('language')}
          >
            {language.toUpperCase()}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={nextTheme}
            aria-label={`${text('theme')}: ${text(theme)}`}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
          </button>
          <span className="user-chip">{session.username}</span>
          <button
            className="text-button logout-button"
            type="button"
            onClick={onLogout}
            aria-label={text('signOut')}
          >
            <Icon name="logout" size={18} />
            <span>{text('signOut')}</span>
          </button>
        </div>
      </header>

      <aside className="side-bar" aria-label={text('storages')}>
        <p className="side-title">{text('storages')}</p>
        <nav className="storage-nav">
          {storages.map((storage) => (
            <NavLink
              key={storage.id}
              to={`/files/${storage.id}`}
              className={({ isActive }) => `storage-link ${isActive ? 'active' : ''}`}
            >
              <span className="storage-icon">
                <Icon name="storage" />
              </span>
              <span>
                <strong>{storage.name}</strong>
                <small>
                  {storage.available
                    ? storage.can_upload
                      ? text('writable')
                      : text('readOnly')
                    : text('notAvailable')}
                </small>
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-view">{children}</main>

      <nav className="mobile-dock" aria-label={text('storages')}>
        {storages.slice(0, 4).map((storage) => (
          <NavLink
            key={storage.id}
            to={`/files/${storage.id}`}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon name="storage" />
            <span>{storage.name}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
