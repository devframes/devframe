#!/usr/bin/env node
import process from 'node:process'
import { createMessagesCli } from './dist/cli.mjs'

async function main() {
  const cli = createMessagesCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
