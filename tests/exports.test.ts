import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

describePackagesApiSnapshots({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  filter(ctx) {
    // Only snapshot first-party workspace packages. Auto-discovery can walk
    // into `node_modules` depending on the installed layout (e.g. pnpm's
    // `shamefullyHoist`), which would try to snapshot dependencies like
    // `@babel/runtime` and crash on their directory-valued `exports`.
    if (/[\\/]node_modules[\\/]/.test(ctx.packageRoot))
      return false
    const pkg = JSON.parse(
      readFileSync(`${ctx.packageRoot}/package.json`, 'utf8'),
    )
    if (!pkg.name || pkg.private)
      return false
  },
})
