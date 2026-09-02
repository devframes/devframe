import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDevframeCli } from './main'

describe('runDevframeCli', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows help for a bare invocation (no subcommand)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await runDevframeCli(['node', 'devframe'])
    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0]![0]).toContain('connect')
  })

  it('shows help exactly once for --help (not doubled by the bare-invocation fallback)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await runDevframeCli(['node', 'devframe', '--help'])
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('shows help for an unrecognized subcommand', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await runDevframeCli(['node', 'devframe', 'bogus'])
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('does not show help when a real subcommand matches', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    // `connect --help` matches the `connect` command and prints *its* help
    // (cac's built-in per-command path) rather than the bare-invocation
    // fallback - still exactly once.
    await runDevframeCli(['node', 'devframe', 'connect', '--help'])
    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0]![0]).toContain('--port')
  })
})
