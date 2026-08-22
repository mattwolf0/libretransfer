import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'

import { loadSession, loadStorages, logout, type SessionInfo } from './api'
import { AppShell } from './components/AppShell'
import { FileBrowser } from './components/FileBrowser'
import { LoginForm } from './components/LoginForm'
import { useText } from './i18n'

export default function App() {
  const { text } = useText()
  const queryClient = useQueryClient()
  const session = useQuery({
    queryKey: ['session'],
    queryFn: loadSession,
    retry: false,
  })
  const storages = useQuery({
    queryKey: ['storages'],
    queryFn: loadStorages,
    enabled: session.data?.authenticated === true,
  })

  function updateSession(sessionInfo: SessionInfo) {
    queryClient.setQueryData(['session'], sessionInfo)
  }

  async function signOut() {
    if (session.data?.csrf) await logout(session.data.csrf)
    updateSession({ authenticated: false })
    queryClient.removeQueries({ queryKey: ['storages'] })
    queryClient.removeQueries({ queryKey: ['files'] })
  }

  if (session.isPending) {
    return <div className="page-note">{text('loading')}</div>
  }
  if (session.isError) {
    return <div className="page-note error-note">{session.error.message}</div>
  }
  if (!session.data.authenticated) {
    return <LoginForm onLogin={updateSession} />
  }
  if (!session.data.csrf) {
    return <div className="page-note error-note">The session is missing its security token.</div>
  }

  return (
    <AppShell session={session.data} storages={storages.data ?? []} onLogout={() => void signOut()}>
      {storages.isPending ? (
        <div className="page-note">{text('loading')}</div>
      ) : storages.isError ? (
        <div className="page-note error-note">{storages.error.message}</div>
      ) : storages.data.length === 0 ? (
        <section className="empty-page">
          <h1>{text('noStorage')}</h1>
          <p>{text('noStorageNote')}</p>
        </section>
      ) : (
        <Routes>
          <Route
            path="/files/:storageId"
            element={<FileBrowser csrf={session.data.csrf} storages={storages.data} />}
          />
          <Route path="*" element={<Navigate replace to={`/files/${storages.data[0]!.id}`} />} />
        </Routes>
      )}
    </AppShell>
  )
}
