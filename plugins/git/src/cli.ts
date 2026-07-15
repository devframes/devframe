import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import { createGitDevframe } from './index.ts'

const cli = createCac(createGitDevframe(), {
  onReady({ origin }) {
    // devframe is headless by default — print our own ready banner so the
    // dev server doesn't look like it silently did nothing.
    console.error(`\n  @devframes/plugin-git ready at ${origin}\n`)
  },
})

cli.parse().catch((error) => {
  console.error(error)
  process.exit(1)
})
