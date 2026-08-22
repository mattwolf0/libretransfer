import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { LanguageProvider } from '../i18n'
import { LoginForm } from './LoginForm'

afterEach(() => vi.restoreAllMocks())

it('signs in with the form values', async () => {
  const user = userEvent.setup()
  const onLogin = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        authenticated: true,
        username: 'admin',
        csrf: 'token',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ),
  )
  render(
    <LanguageProvider>
      <LoginForm onLogin={onLogin} />
    </LanguageProvider>,
  )

  await user.type(screen.getByLabelText('Password'), 'good-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() =>
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin' })),
  )
  expect(globalThis.fetch).toHaveBeenCalledWith(
    '/api/v1/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'good-password' }),
    }),
  )
})

it('shows a short login error', async () => {
  const user = userEvent.setup()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'Username or password is not correct.',
        code: 'login_failed',
      }),
      { status: 401 },
    ),
  )
  render(
    <LanguageProvider>
      <LoginForm onLogin={vi.fn()} />
    </LanguageProvider>,
  )

  await user.type(screen.getByLabelText('Password'), 'wrong-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Username or password is not correct.')
})
