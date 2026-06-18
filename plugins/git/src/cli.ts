import process from 'node:process'
import { createCli } from 'devframe/adapters/cli'
import { createGitDevframe } from './index.ts'

const cli = createCli(createGitDevframe())

cli.parse().catch((error) => {
  console.error(error)
  process.exit(1)
})
