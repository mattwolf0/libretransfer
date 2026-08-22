import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

import { loadFolder, type FolderInfo } from '../api'
import { LanguageProvider } from '../i18n'
import { FileBrowser } from './FileBrowser'

vi.mock('../api', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('../api')>()
  return { ...original, loadFolder: vi.fn() }
})

const folder: FolderInfo = {
  storage: 'main',
  path: '',
  can_upload: true,
  page: 1,
  page_size: 50,
  total_items: 2,
  total_pages: 2,
  items: [
    {
      name: 'Work',
      is_folder: true,
      size: 0,
      modified: '2026-08-09T10:00:00Z',
    },
    {
      name: 'report.pdf',
      is_folder: false,
      size: 2048,
      modified: '2026-08-09T10:00:00Z',
    },
  ],
}

beforeEach(() => {
  vi.mocked(loadFolder).mockResolvedValue(folder)
})

function renderBrowser(entry = '/files/main') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <LanguageProvider>
          <Routes>
            <Route
              path="/files/:storageId"
              element={
                <FileBrowser
                  csrf="token"
                  storages={[
                    {
                      id: 'main',
                      name: 'Files',
                      can_upload: true,
                      available: true,
                    },
                  ]}
                />
              }
            />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

it('shows folders, types and clear file actions', async () => {
  renderBrowser()

  expect(await screen.findByText('Work')).toBeInTheDocument()
  expect(screen.getByText('PDF')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Download: report.pdf' })).toHaveAttribute(
    'href',
    '/api/v1/files/download?storage=main&path=report.pdf',
  )
  expect(screen.getByRole('button', { name: 'Copy link: report.pdf' })).toBeInTheDocument()
})

it('searches and sorts through the folder api', async () => {
  const user = userEvent.setup()
  renderBrowser()
  await screen.findByText('report.pdf')
  vi.mocked(loadFolder).mockClear()

  await user.type(screen.getByRole('searchbox', { name: 'Search by file name' }), 'report')
  await waitFor(
    () =>
      expect(loadFolder).toHaveBeenCalledWith(
        'main',
        '',
        expect.objectContaining({ search: 'report' }),
      ),
    { timeout: 1000 },
  )

  vi.mocked(loadFolder).mockClear()
  await user.click(screen.getByRole('button', { name: 'Name' }))
  await waitFor(() =>
    expect(loadFolder).toHaveBeenCalledWith(
      'main',
      '',
      expect.objectContaining({ sort: 'name', direction: 'desc' }),
    ),
  )
})

it('selects the visible files and shows bulk actions', async () => {
  const user = userEvent.setup()
  renderBrowser()
  await screen.findByText('report.pdf')

  await user.click(screen.getByRole('checkbox', { name: 'Select report.pdf' }))

  expect(screen.getByText('1 selected')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy links' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Move to trash' })).toBeInTheDocument()
})

it('copies an authenticated download link', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  renderBrowser()
  await screen.findByText('report.pdf')

  await user.click(screen.getByRole('button', { name: 'Copy link: report.pdf' }))

  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/files/download?storage=main&path=report.pdf'),
    ),
  )
  expect(screen.getByText(/The user must be signed in/)).toBeInTheDocument()
})

it('opens the next page', async () => {
  const user = userEvent.setup()
  renderBrowser()
  await screen.findByText('report.pdf')
  vi.mocked(loadFolder).mockClear()

  await user.click(screen.getByRole('button', { name: 'Next' }))

  await waitFor(() =>
    expect(loadFolder).toHaveBeenCalledWith('main', '', expect.objectContaining({ page: 2 })),
  )
})
