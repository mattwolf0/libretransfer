import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { LanguageProvider, useText } from './i18n'

function SampleText() {
  const { language, setLanguage, text } = useText()
  return (
    <div>
      <span>{text('signIn')}</span>
      <button type="button" onClick={() => setLanguage(language === 'en' ? 'hu' : 'en')}>
        Change
      </button>
    </div>
  )
}

it('changes the language and saves it', async () => {
  const user = userEvent.setup()
  render(
    <LanguageProvider>
      <SampleText />
    </LanguageProvider>,
  )

  expect(screen.getByText('Sign in')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Change' }))

  expect(screen.getByText('Belépés')).toBeInTheDocument()
  expect(localStorage.getItem('libretransfer-language')).toBe('hu')
})
