#!/usr/bin/env node
import process from 'node:process'
import { createInspectCli } from './dist/cli.mjs'

async function main() {
  const cli = createInspectCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
