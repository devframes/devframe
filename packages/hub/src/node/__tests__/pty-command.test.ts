import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { resolvePtyCommand } from '../pty-command'

const bin = mkdtempSync(join(tmpdir(), 'devframe-pty-command-'))
writeFileSync(join(bin, 'pnpm.cmd'), '')
writeFileSync(join(bin, 'legacy.bat'), '')
writeFileSync(join(bin, 'node.exe'), '')

afterAll(() => rmSync(bin, { recursive: true, force: true }))

const win32 = { cwd: tmpdir(), platform: 'win32' as const, env: { Path: bin, ComSpec: 'C:\\Windows\\system32\\cmd.exe' } }

describe('resolvePtyCommand', () => {
  it('runs .cmd shims through ComSpec on win32', () => {
    expect(resolvePtyCommand('pnpm', ['exec', 'storybook', 'dev', '-p', '6006'], win32)).toEqual({
      command: 'C:\\Windows\\system32\\cmd.exe',
      args: ['/d', '/c', 'pnpm', 'exec', 'storybook', 'dev', '-p', '6006'],
    })
  })

  it('runs .bat files through ComSpec on win32', () => {
    expect(resolvePtyCommand('legacy', [], win32).command).toBe('C:\\Windows\\system32\\cmd.exe')
  })

  it('falls back to cmd.exe without ComSpec', () => {
    expect(resolvePtyCommand('pnpm', [], { ...win32, env: { PATH: bin } }).command).toBe('cmd.exe')
  })

  it('runs unresolved commands through cmd.exe so a typo fails like a shell would', () => {
    expect(resolvePtyCommand('does-not-exist', ['x'], win32).args).toEqual(['/d', '/c', 'does-not-exist', 'x'])
  })

  it('spawns real executables directly on win32', () => {
    expect(resolvePtyCommand('node', ['-v'], win32)).toEqual({ command: 'node', args: ['-v'] })
    expect(resolvePtyCommand(join(bin, 'node.exe'), ['-v'], win32)).toEqual({ command: join(bin, 'node.exe'), args: ['-v'] })
  })

  it('does not wrap cmd.exe itself', () => {
    expect(resolvePtyCommand('cmd.exe', ['/c', 'dir'], win32)).toEqual({ command: 'cmd.exe', args: ['/c', 'dir'] })
    expect(resolvePtyCommand('C:\\Windows\\system32\\cmd.exe', [], win32).args).toEqual([])
  })

  it('escapes cmd metacharacters in bare arguments, twice for batch shims', () => {
    expect(resolvePtyCommand('does-not-exist', ['a&b', 'x(y)'], win32).args).toEqual(['/d', '/c', 'does-not-exist', 'a^&b', 'x^(y^)'])
    expect(resolvePtyCommand('pnpm', ['a&b', '50%'], win32).args).toEqual(['/d', '/c', 'pnpm', 'a^^^&b', '50^^^%'])
  })

  it('leaves arguments zigpty quotes untouched', () => {
    expect(resolvePtyCommand('pnpm', ['a b&c', '', 'say "hi"', 'a\tb&c'], win32).args).toEqual(['/d', '/c', 'pnpm', 'a b&c', '', 'say "hi"', 'a\tb&c'])
  })

  it('leaves arguments with backslashes untouched, since zigpty quotes them', () => {
    expect(resolvePtyCommand('pnpm', ['src\\**\\*.ts', 'dir\\file(1).txt'], win32).args).toEqual(['/d', '/c', 'pnpm', 'src\\**\\*.ts', 'dir\\file(1).txt'])
    expect(resolvePtyCommand('C:\\a(1)\\x.cmd', [], win32).args).toEqual(['/d', '/c', 'C:\\a(1)\\x.cmd'])
  })

  it('skips the cwd when NoDefaultCurrentDirectoryInExePath is set', () => {
    const env = { NoDefaultCurrentDirectoryInExePath: '1', ComSpec: 'cmd.exe' }
    expect(resolvePtyCommand('node', [], { ...win32, cwd: bin, env }).command).toBe('cmd.exe')
    expect(resolvePtyCommand('node', [], { ...win32, cwd: bin, env: { ComSpec: 'cmd.exe' } }).command).toBe('node')
  })

  it('leaves the command unchanged on other platforms', () => {
    for (const platform of ['linux', 'darwin'] as const)
      expect(resolvePtyCommand('pnpm', ['a&b'], { ...win32, platform })).toEqual({ command: 'pnpm', args: ['a&b'] })
  })
})
