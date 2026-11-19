import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { runInstall } from '../src/install'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

describe('runInstall', () => {
  it('stops a package manager that hangs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'onboard-install-'))
    dirs.push(cwd)
    // Stands in for a hung package manager; a grandchild keeps the pipes open for 3 s.
    const script = 'require("child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "inherit" }); setInterval(() => {}, 1000)'
    const started = Date.now()
    await expect(runInstall(
      {
        cwd,
        packages: ['foo'],
        dev: true,
        timeout: 300,
      },
      {
        command: process.execPath,
        args: ['-e', script],
      },
    )).rejects.toMatchObject({ code: 'DF9009' })
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
