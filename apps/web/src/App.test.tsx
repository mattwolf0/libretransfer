import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'

import App from './App'
import { LanguageProvider } from './i18n'

it('returns to the login screen after sign out', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.href
    if (url === '/api/v1/session') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            authenticated: true,
            username: 'admin',
            csrf: 'test-csrf',
          }),
          { status: 200 },
        ),
      )
    }
    if (url === '/api/v1/storages') {
      return Promise.resolve(new Response(JSON.stringify({ storages: [] }), { status: 200 }))
    }
    if (url === '/api/v1/logout') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  await user.click(await screen.findByRole('button', { name: 'Sign out' }))

  expect(await screen.findByRole('heading', { name: 'LibreTransfer' })).toBeInTheDocument()
  const logoutCall = fetchMock.mock.calls.find(([input]) => input === '/api/v1/logout')
  expect(logoutCall?.[1]?.method).toBe('POST')
  expect(new Headers(logoutCall?.[1]?.headers).get('X-CSRF-Token')).toBe('test-csrf')
})
