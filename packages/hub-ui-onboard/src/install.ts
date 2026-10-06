import type { ResolvedCommand } from 'package-manager-detector'
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
}

/** The `add` command for the project's package manager, `npm` when none is detected. */
export async function resolveInstallCommand(plan: InstallPlan): Promise<ResolvedCommand> {
  const detected = await detect({ cwd: plan.cwd })
  const agent = detected?.agent ?? 'npm'
  const args = [...(plan.dev ? ['-D'] : []), ...plan.packages]
  // `add` exists for every agent the detector knows, so the null branch is unreachable.
  return resolveCommand(agent, 'add', args)!
}

export function formatCommand(command: ResolvedCommand): string {
  return [command.command, ...command.args].join(' ')
}

/**
 * Run the install and make sure that each named package landed in
 * `<cwd>/node_modules`. Throws a `DF9001` / `DF9002` diagnostic on failure.
 */
export async function runInstall(plan: InstallPlan, command: ResolvedCommand): Promise<void> {
  const result = await exec(command.command, command.args, {
    // `CI` keeps every package manager non-interactive: nobody can answer a prompt here.
    nodeOptions: { cwd: plan.cwd, env: { ...process.env, CI: '1' } },
  })
  if (result.exitCode !== 0) {
    throw diagnostics.DF9001({
      command: formatCommand(command),
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
  const match = /^(@[^/@]+\/[^/@]+|[^/@]+)(?:@[^/]*)?$/.exec(spec)
  return match?.[1]
}
