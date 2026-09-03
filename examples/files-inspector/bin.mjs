#!/usr/bin/env node
import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import devframe from './src/devframe.ts'

async function main() {
  // Serve the agent surface at `/__mcp` and register for `devframe connect`
  // discovery. This loopback demo trusts same-machine callers (`mcp: true`);
  // a network-reachable tool would harden it with `mcp: { authorization }`.
  const cli = createCac(devframe, { mcp: true })
  await cli.parse()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
