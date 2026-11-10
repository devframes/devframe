import type { ResolvedCommand } from 'package-manager-detector'
import type { Result } from 'tinyexec'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { detect, resolveCommand } from 'package-manager-detector'
import { exec } from 'tinyexec'
import { diagnostics } from './diagnostics'

export interface InstallPlan {
  cwd: string
  packages: string[]
  dev: boolean
  /** Stop the install after this many milliseconds. */
  timeout: number
}

/** The `add` command for the project's package manager, `npm` when none is detected. */
export async function resolveInstallCommand(plan: InstallPlan): Promise<ResolvedCommand> {
  const detected = await detect({ cwd: plan.cwd })
  const agent = detected?.agent ?? 'npm'
  const args = [
    ...(plan.dev
      ? ['-D']
      : []),
    ...plan.packages,
  ]
  // `add` exists for every agent the detector knows, so the null branch is unreachable.
  return resolveCommand(agent, 'add', args)!
}

/**
 * Run the install and make sure that each named package landed in
 * `<cwd>/node_modules`. Throws a `DF9001` / `DF9002` / `DF9009` diagnostic on failure.
 */
export async function runInstall(plan: InstallPlan, command: ResolvedCommand): Promise<void> {
  const commandLine = [command.command, ...command.args].join(' ')
  const child = exec(command.command, command.args, {
    // `CI` keeps every package manager non-interactive: nobody can answer a prompt here.
    nodeOptions: {
      cwd: plan.cwd,
      env: { ...process.env, CI: '1' },
    },
  })
  // A hung package manager never exits. Stop it and fail at once: a child
  // process can keep the output pipes open after the kill. The kill can also
  // end the install with an exit code first, so the timeout error wins.
  let timer: ReturnType<typeof setTimeout> | undefined
  let killed: Promise<void> | undefined
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      killed = killTree(child)
      void killed.then(() => resolve(undefined))
    }, plan.timeout)
  })
  const result = await Promise.race([child, timedOut]).finally(() => clearTimeout(timer))
  // `result` is `undefined` only when the timeout won the race.
  if (killed || !result) {
    await killed
    throw diagnostics.DF9009({
      command: commandLine,
      seconds: Math.round(plan.timeout / 1000),
    })
  }
  if (result.exitCode !== 0) {
    throw diagnostics.DF9001({
      command: commandLine,
      exitCode: result.exitCode,
      stderr: result.stderr.trim().slice(-2048),
    })
  }
  for (const name of namedPackages(plan)) {
    if (!isInstalled(plan.cwd, name))
      throw diagnostics.DF9002({ name, cwd: plan.cwd })
  }
}

/**
 * Kill the install with everything it started. On Windows, tinyexec runs a
 * package manager's `.cmd` shim through `cmd.exe`, and a kill does not reach
 * child processes, so `taskkill /T /F` ends the whole tree.
 */
async function killTree(child: Result): Promise<void> {
  const pid = child.process?.pid
  if (process.platform === 'win32' && pid !== undefined) {
    const result = await exec('taskkill', [
      '/pid',
      String(pid),
      '/T',
      '/F',
    ]).then(r => r, () => undefined)
    if (result?.exitCode === 0)
      return
  }
  child.kill()
}

/**
 * `true` when every named package is already in `<cwd>/node_modules`, so the
 * onboarding has nothing to install. Path, URL and alias specs cannot be
 * checked by name, so a plan made only of those is never "already installed".
 */
export function packagesInstalled(plan: InstallPlan): boolean {
  const names = namedPackages(plan)
  return names.length > 0 && names.every(name => isInstalled(plan.cwd, name))
}

function isInstalled(cwd: string, name: string): boolean {
  return existsSync(join(cwd, 'node_modules', name))
}

function namedPackages(plan: InstallPlan): string[] {
  return plan.packages.map(packageName).filter((name): name is string => name !== undefined)
}

/**
 * The package name of a bare spec (`foo`, `@scope/foo@^1`), or `undefined`
 * for a path, URL or alias spec whose installed name is not in the spec.
 */
function packageName(spec: string): string | undefined {
  // npm name characters only, so `file:`, `link:`, `npm:` aliases, URLs and
  // Windows paths (`file:D:\pkg`) never pass as a name.
  const match = /^((?:@[\w.~-]+\/)?[\w.~-]+)(?:@[^/]*)?$/.exec(spec)
  return match?.[1]
}
