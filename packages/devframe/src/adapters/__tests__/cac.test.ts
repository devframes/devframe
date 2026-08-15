import { defineDevframe } from 'devframe'
import { describe, expect, it } from 'vitest'
import { createCac } from '../cac'

function baseDevframe(overrides: Partial<ReturnType<typeof defineDevframe>> = {}) {
  return defineDevframe({
    id: 'devframe-test',
    name: 'Devframe Test',
    version: '0.0.0',
    packageName: 'devframe-test',
    homepage: 'https://example.test',
    description: 'Test devframe.',
    setup: () => {},
    ...overrides,
  })
}

describe('adapters/cac', () => {
  it('registers the build subcommand by default', () => {
    const { cli } = createCac(baseDevframe())
    expect(cli.commands.map(c => c.name)).toContain('build')
  })

  it('skips the build subcommand when capabilities.build is false', () => {
    const { cli } = createCac(baseDevframe({ capabilities: { build: false } }))
    expect(cli.commands.map(c => c.name)).not.toContain('build')
  })

  it('still registers build when capabilities.build is true', () => {
    const truthy = createCac(baseDevframe({ capabilities: { build: true } }))
    expect(truthy.cli.commands.map(c => c.name)).toContain('build')
  })

  it('always registers the dev and mcp commands regardless of capabilities.build', () => {
    const { cli } = createCac(baseDevframe({ capabilities: { build: false } }))
    const names = cli.commands.map(c => c.name)
    expect(names).toContain('mcp')
    // The dev command is registered as the catch-all `[...args]` command,
    // which cac surfaces with an empty `name`.
    expect(cli.commands.some(c => c.rawName === '[...args]')).toBe(true)
  })
})
