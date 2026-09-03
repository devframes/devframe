#!/usr/bin/env node
import process from 'node:process'
import { createAssetsCli } from './dist/node/cli.mjs'

async function main() {
  await createAssetsCli().parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
