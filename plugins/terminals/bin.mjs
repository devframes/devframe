#!/usr/bin/env node
import process from 'node:process'
import { createTerminalsCli } from './dist/cli.mjs'

async function main() {
  const cli = createTerminalsCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
