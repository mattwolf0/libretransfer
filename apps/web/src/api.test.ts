import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadUrl, loadSession } from './api'

describe('api', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the current session', async () => {
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

    const session = await loadSession()

    expect(session.username).toBe('admin')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/session',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('keeps the server error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Please sign in first.',
          code: 'login_required',
        }),
        { status: 401 },
      ),
    )

    await expect(loadSession()).rejects.toMatchObject({
      message: 'Please sign in first.',
      code: 'login_required',
      status: 401,
    })
  })

  it('encodes a download path', () => {
    expect(downloadUrl('main', 'Work/my file.txt')).toBe(
      '/api/v1/files/download?storage=main&path=Work%2Fmy+file.txt',
    )
  })
})
