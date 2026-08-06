import { spawnSync } from 'node:child_process'
import process from 'node:process'

/**
 * Windows CI runners intermittently crash while spawning devframe's native
 * build toolchain (rolldown, via tsdown/vite) with
 * `STATUS_DLL_INIT_FAILED` (exit code -1073741502, surfaced by pnpm/turbo
 * as 3221225794) under `turbo run build`'s concurrency — an environment
 * fault unrelated to the code under test. `unit-test / test
 * (windows-latest, *)` in the "CI" workflow has failed on this signature
 * across many unrelated commits and packages.
 *
 * Retries the given command a bounded number of times instead of failing
 * the run on this class of transient crash. A genuine compile error fails
 * the same way on every attempt, so it still surfaces after the retry
 * budget is spent.
 */

const [, , ...commandParts] = process.argv
if (commandParts.length === 0) {
  console.error('Usage: tsx scripts/ci-retry.ts <command...>')
  process.exit(1)
}

const command = commandParts.join(' ')
const attempts = Number(process.env.CI_RETRY_ATTEMPTS ?? 3)
const delayMs = Number(process.env.CI_RETRY_DELAY_MS ?? 5000)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = spawnSync(command, { stdio: 'inherit', shell: true })
    if (result.status === 0)
      return

    const code = result.status ?? result.signal ?? 'unknown'
    const isLastAttempt = attempt === attempts
    console.error(`\n[ci-retry] \`${command}\` failed (exit ${code}), attempt ${attempt}/${attempts}${isLastAttempt ? '' : ` — retrying in ${delayMs}ms`}\n`)

    if (isLastAttempt)
      process.exit(typeof result.status === 'number' ? result.status : 1)

    await sleep(delayMs)
  }
}

main()
