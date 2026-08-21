import { defineConfig } from 'bumpp'
import { syncStarterVersion } from './scripts/sync-starter-version.ts'

export default defineConfig({
  // `starter/` pins real `devframe`/`@devframes/*` versions (it's a
  // copy-paste-ready template, not a workspace member consuming
  // `catalog:`/`workspace:*`), so `bumpp -r` can't reach it on its own -
  // sync it here, before the version-bump commit is made.
  execute: operation => syncStarterVersion(operation.state.newVersion),
})
