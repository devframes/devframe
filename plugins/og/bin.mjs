#!/usr/bin/env node
import process from 'node:process'
import { createOgCli } from './dist/cli.mjs'

async function main() {
  await createOgCli().parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
