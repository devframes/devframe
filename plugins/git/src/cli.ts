import process from 'node:process'
import { createCli } from 'devframe/adapters/cli'
import { createGitDevframe } from './index.ts'

const cli = createCli(createGitDevframe(), {
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
