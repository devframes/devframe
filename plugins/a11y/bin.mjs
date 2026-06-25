#!/usr/bin/env node
import process from 'node:process'
import { createA11yCli } from './dist/cli.mjs'

async function main() {
  const cli = createA11yCli()
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
