#!/usr/bin/env node
import process from 'node:process'
import { createDataInspectorCli } from './dist/cli.mjs'

async function main() {
  const cli = createDataInspectorCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
