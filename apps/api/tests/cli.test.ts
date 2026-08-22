import { afterEach, describe, expect, it, vi } from 'vitest'

import { main } from '../src/cli.js'

describe('CLI help', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function runHelp(args: string[]) {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line) => lines.push(String(line)))
    expect(await main(args)).toBe(0)
    return lines.join('\n')
  }

  it('shows the main help when no command is given', async () => {
    const output = await runHelp([])
    expect(output).toContain('pnpm cli <group> <command>')
    expect(output).toContain('pnpm cli help app')
    expect(output).toContain('pnpm cli help user')
  })

  it('shows help for each command group', async () => {
    expect(await runHelp(['help', 'app'])).toContain('pnpm cli app start')
    expect(await runHelp(['help', 'user'])).toContain('pnpm cli user password [name]')
  })

  it('rejects an unknown help topic', async () => {
    await expect(main(['help', 'storage'])).rejects.toThrow(
      'Unknown help topic: storage. Run pnpm cli help.',
    )
  })
})
