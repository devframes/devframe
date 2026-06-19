#!/usr/bin/env node
import process from 'node:process'
import { createCodeServerCli } from './dist/cli.mjs'

async function main() {
  const cli = createCodeServerCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
