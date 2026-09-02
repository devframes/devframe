import process from 'node:process'
import { defineConfig } from 'bumpp'
import { x } from 'tinyexec'
import { syncStarterVersion } from './scripts/sync-starter-version.ts'

export default defineConfig({
  all: true,
  /**
   * `starter/` pins real `devframe`/`@devframes/*` versions (it's a
   * copy-paste-ready template, not a workspace member consuming
   * `catalog:`/`workspace:*`), so `bumpp -r` can't reach it on its own -
   * sync it here, before the version-bump commit is made.
   */
  execute: async (operation) => {
    await syncStarterVersion(operation.state.newVersion)
    await x('pnpm', ['install', '--frozen-lockfile=false'], { nodeOptions: { stdio: 'inherit', cwd: process.cwd() } })
  },
})
