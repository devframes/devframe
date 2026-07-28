#!/usr/bin/env node
import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import devframe from './src/devframe.ts'

async function main() {
  const cli = createCac(devframe)
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
