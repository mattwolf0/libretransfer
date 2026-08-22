import { describe, expect, it } from 'vitest'

import { fileType } from './fileHelpers'

describe('fileType', () => {
  it('shows folders with the translated folder label', () => {
    expect(fileType({ name: 'Work', is_folder: true }, 'Folder', 'File')).toBe('Folder')
  })

  it('shows an uppercase file extension', () => {
    expect(fileType({ name: 'report.final.pdf', is_folder: false }, 'Folder', 'File')).toBe('PDF')
  })

  it('keeps extensionless and hidden files generic', () => {
    expect(fileType({ name: 'README', is_folder: false }, 'Folder', 'File')).toBe('File')
    expect(fileType({ name: '.env', is_folder: false }, 'Folder', 'File')).toBe('File')
  })
})
