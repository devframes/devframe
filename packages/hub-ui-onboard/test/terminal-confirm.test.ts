import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { confirmInTerminal } from '../src/terminal-confirm'

const COMMAND = ['pnpm', 'add', '-D', '@nuxt/devtools']

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
afterEach(() => warn.mockClear())

const terminal = () => Object.assign(new PassThrough(), { isTTY: true })
const printed = () => String(warn.mock.lastCall?.[0])

it.each([
  ['y\n', true],
  ['Yes\n', true],
  ['\n', false],
  ['n\n', false],
])('answers %j with %s and releases the terminal', async (line, allowed) => {
  const input = terminal()
  const answer = confirmInTerminal(COMMAND, input)
  expect(printed()).toContain('DF9005')
  expect(printed()).toContain('pnpm add -D @nuxt/devtools')

  input.write(line)
  expect(await answer).toBe(allowed)
  expect(input.readableFlowing).toBe(false)
})

it('keeps the terminal flowing for a reader that was there first', async () => {
  const input = terminal()
  const shortcuts: string[] = []
  input.on('data', chunk => shortcuts.push(String(chunk)))

  const answer = confirmInTerminal(COMMAND, input)
  input.write('y\n')
  expect(await answer).toBe(true)
  expect(input.readableFlowing).toBe(true)
  expect(shortcuts).toEqual(['y\n'])
})

it('refuses at once without a TTY', async () => {
  expect(await confirmInTerminal(COMMAND, new PassThrough())).toBe(false)
  expect(printed()).toContain('DF9006')
})
