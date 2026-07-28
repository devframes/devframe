#!/usr/bin/env node
import process from 'node:process'
import { runDevframeCli } from '../dist/cli/main.mjs'

runDevframeCli().catch((error) => {
  console.error(error)
  process.exit(1)
})
